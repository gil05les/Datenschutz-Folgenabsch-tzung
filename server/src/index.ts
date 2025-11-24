import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import axios from 'axios';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';

// Load environment variables from project root
// The .env file is in the project root, which is one level up from server/
// Try multiple paths to find .env file (works in both dev and production)
const possibleEnvPaths = [
  path.resolve(process.cwd(), '..', '.env'),  // From server/ directory (when running via make)
  path.resolve(__dirname, '../../.env'),       // From server/dist/ or server/src/ (compiled/dev)
  path.resolve(process.cwd(), '.env'),         // From project root (if running from there)
];

let envPath: string | null = null;
for (const envPathCandidate of possibleEnvPaths) {
  if (fs.existsSync(envPathCandidate)) {
    envPath = envPathCandidate;
    break;
  }
}

if (envPath) {
  const result = dotenv.config({ path: envPath });
  if (result.error) {
    console.warn(`Warning: Error loading .env file from ${envPath}:`, result.error);
  } else {
    console.log(`Loaded environment variables from: ${envPath}`);
  }
} else {
  console.warn('Warning: Could not find .env file. Using default values and environment variables.');
  // Still try dotenv.config() in case .env is in current working directory
  dotenv.config();
}

const app = express();
const PORT = process.env.PORT || 3001;
const OPENROUTER_BASE_URL = process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1';
// Parse comma-separated models from environment variable
const OPENROUTER_MODELS_STRING = process.env.OPENROUTER_MODEL || 'x-ai/grok-4.1-fast:free';
const OPENROUTER_MODELS = OPENROUTER_MODELS_STRING.split(',').map(m => m.trim()).filter(Boolean);
const OPENROUTER_MODEL = OPENROUTER_MODELS[0] || 'x-ai/grok-4.1-fast:free'; // Default model (first one)
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_APP_URL = process.env.OPENROUTER_APP_URL || process.env.VERCEL_URL || 'http://localhost:3001';

// --- Lightweight DSG retrieval setup (RAG) ---
type DsgArticle = {
  id: string;
  heading: string;
  text: string;
};

const DSG_XML_PATH = path.resolve(__dirname, '../../dsg.xml');

const stripTags = (html: string): string => html.replace(/<[^>]+>/g, ' ');

const tokenize = (value: string): string[] =>
  (value.toLowerCase().match(/[a-zäöüöäß]+/gi) || []).map((t) => t.trim()).filter(Boolean);

const extractDsgArticles = (xml: string): DsgArticle[] => {
  const articles: DsgArticle[] = [];
  const articleRegex = /<article[^>]*>([\s\S]*?)<\/article>/gi;
  let match;

  while ((match = articleRegex.exec(xml)) !== null) {
    const articleBlock = match[1];
    
    // Try new format first: <number>Art. X</number>
    let numMatch = articleBlock.match(/<number>([\s\S]*?)<\/number>/i);
    // Fallback to old format: <num><b>Art. X</b></num>
    if (!numMatch) {
      numMatch = articleBlock.match(/<num><b>(Art\.\s*[^<]+)<\/b><\/num>/i);
    }
    
    const headingMatch = articleBlock.match(/<heading>([\s\S]*?)<\/heading>/i);

    const id = numMatch ? stripTags(numMatch[1]).trim() : 'Unbekannt';
    const heading = headingMatch ? stripTags(headingMatch[1]).trim() : 'Ohne Titel';
    
    // Extract all paragraph text for better context
    const paragraphTexts: string[] = [];
    const paragraphRegex = /<paragraph[^>]*>([\s\S]*?)<\/paragraph>/gi;
    let paraMatch;
    while ((paraMatch = paragraphRegex.exec(articleBlock)) !== null) {
      const paraText = stripTags(paraMatch[1]).replace(/\s+/g, ' ').trim();
      if (paraText) {
        paragraphTexts.push(paraText);
      }
    }
    
    // Use paragraph texts if available, otherwise use all text
    const text = paragraphTexts.length > 0 
      ? paragraphTexts.join(' ')
      : stripTags(articleBlock).replace(/\s+/g, ' ').trim();

    articles.push({ id, heading, text });
  }

  return articles;
};

const loadDsgArticles = (): DsgArticle[] => {
  try {
    const xml = fs.readFileSync(DSG_XML_PATH, 'utf-8');
    return extractDsgArticles(xml);
  } catch (err) {
    console.warn('Konnte dsg.xml nicht laden, RAG deaktiviert:', err);
    return [];
  }
};

const DSG_ARTICLES = loadDsgArticles();

const retrieveDsgContext = (query: string, limit = 5): DsgArticle[] => {
  if (!DSG_ARTICLES.length) return [];
  const queryTokens = tokenize(query);
  if (!queryTokens.length) return [];

  const scores = DSG_ARTICLES.map((article) => {
    const articleTokens = new Set(tokenize(article.text));
    let overlap = 0;
    queryTokens.forEach((token) => {
      if (articleTokens.has(token)) overlap += 1;
    });
    return { article, score: overlap };
  });

  return scores
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ article }) => article);
};

// Middleware
app.use(cors());
app.use(express.json());

// Password protection middleware (after body parsing)
const APP_PASSWORD = process.env.APP_PASSWORD || 'mypassword';

const passwordMiddleware = (req: Request, res: Response, next: NextFunction) => {
  // Skip password check for static files in production
  if (process.env.NODE_ENV === 'production' && !req.path.startsWith('/api')) {
    return next();
  }

  // Skip password check for public endpoints (models list)
  if (req.path === '/api/models') {
    return next();
  }

  // Check password for other API endpoints
  if (req.path.startsWith('/api')) {
    const providedPassword = req.headers['x-app-password'] || req.body?.password;
    
    if (!providedPassword || providedPassword !== APP_PASSWORD) {
      return res.status(401).json({ 
        error: 'Unauthorized. Password required.',
        requiresPassword: true 
      });
    }
  }
  
  next();
};

app.use(passwordMiddleware);

// Serve static files from React app in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../client-dist')));
}

// Helper function to generate fedlex URL with article anchor
// Using the systematic collection format that works with the fedlex web interface
const getFedlexUrl = (srNumber: string, article?: string): string => {
  // Use the systematic collection search/browse URL format
  // This format works better with the fedlex JavaScript-based interface
  const baseUrl = `https://www.fedlex.admin.ch/de/filestore/fedlex.data.admin.ch/eli/cc/${srNumber}/latest/de`;
  return article ? `${baseUrl}#art_${article}` : baseUrl;
};

// Mapping of Swiss legal texts to their official URLs
// Using the fedlex systematic collection format that works with the web interface
// Note: These URLs require JavaScript to be enabled in the browser
const SWISS_LAW_URLS: Record<string, string> = {
  // Federal Constitution (BV, SR 101)
  'BV': 'https://www.fedlex.admin.ch/eli/cc/1999/404/de',
  'Bundesverfassung': 'https://www.fedlex.admin.ch/eli/cc/1999/404/de',
  'SR 101': 'https://www.fedlex.admin.ch/eli/cc/1999/404/de',
  
  // Civil Code (ZGB, SR 210)
  'ZGB': 'https://www.fedlex.admin.ch/eli/cc/24/233_245_233/de',
  'Zivilgesetzbuch': 'https://www.fedlex.admin.ch/eli/cc/24/233_245_233/de',
  'SR 210': 'https://www.fedlex.admin.ch/eli/cc/24/233_245_233/de',
  
  // Code of Obligations (OR, SR 220)
  'OR': 'https://www.fedlex.admin.ch/eli/cc/27/317_321_377/de',
  'Obligationenrecht': 'https://www.fedlex.admin.ch/eli/cc/27/317_321_377/de',
  'SR 220': 'https://www.fedlex.admin.ch/eli/cc/27/317_321_377/de',
  
  // Data Protection Act (DSG, SR 235.1)
  // Using search URL format that will find the law in the systematic collection
  // The direct URL format may not work due to JavaScript requirements
  'DSG': 'https://www.fedlex.admin.ch/eli/cc/2022/491/de',
  'Datenschutzgesetz': 'https://www.fedlex.admin.ch/eli/cc/2022/491/de',
  'DSG 2023': 'https://www.fedlex.admin.ch/eli/cc/2022/491/de',
  'SR 235.1': 'https://www.fedlex.admin.ch/eli/cc/2022/491/de',
  
  // Penal Code (StGB, SR 311.0)
  'StGB': 'https://www.fedlex.admin.ch/eli/cc/54/757_781_799/de',
  'Strafgesetzbuch': 'https://www.fedlex.admin.ch/eli/cc/54/757_781_799/de',
  'SR 311.0': 'https://www.fedlex.admin.ch/eli/cc/54/757_781_799/de',
};

// Extract legal references from text
interface LegalReference {
  law: string;
  article?: string;
  paragraph?: string;
  text: string;
  url: string;
}

const extractLegalReferences = (text: string): LegalReference[] => {
  const references: LegalReference[] = [];
  
  // Pattern to match common Swiss law citations
  // Examples: "Art. 5 DSG", "Art. 12 Abs. 1 ZGB", "Art. 28 OR", "Art. 13 BV"
  const patterns = [
    // Art. X DSG / Art. X Datenschutzgesetz
    /Art\.\s*(\d+[a-z]?)\s*(?:Abs\.\s*(\d+))?\s*(DSG|Datenschutzgesetz)/gi,
    // Art. X ZGB / Art. X Zivilgesetzbuch
    /Art\.\s*(\d+[a-z]?)\s*(?:Abs\.\s*(\d+))?\s*(ZGB|Zivilgesetzbuch)/gi,
    // Art. X OR / Art. X Obligationenrecht
    /Art\.\s*(\d+[a-z]?)\s*(?:Abs\.\s*(\d+))?\s*(OR|Obligationenrecht)/gi,
    // Art. X BV / Art. X Bundesverfassung
    /Art\.\s*(\d+[a-z]?)\s*(?:Abs\.\s*(\d+))?\s*(BV|Bundesverfassung)/gi,
    // Art. X StGB / Art. X Strafgesetzbuch
    /Art\.\s*(\d+[a-z]?)\s*(?:Abs\.\s*(\d+))?\s*(StGB|Strafgesetzbuch)/gi,
  ];
  
  patterns.forEach(pattern => {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const article = match[1];
      const paragraph = match[2];
      const lawAbbr = match[3];
      
      // Find the base URL for this law
      const baseUrl = SWISS_LAW_URLS[lawAbbr] || SWISS_LAW_URLS[lawAbbr.toUpperCase()];
      
      if (baseUrl) {
        // Add article anchor to URL if article number is present
        const url = article ? `${baseUrl}#art_${article}` : baseUrl;
        const fullText = match[0];
        references.push({
          law: lawAbbr,
          article,
          paragraph,
          text: fullText,
          url: url,
        });
      }
    }
  });
  
  // Remove duplicates
  const uniqueRefs = references.filter((ref, index, self) =>
    index === self.findIndex((r) => r.text === ref.text)
  );
  
  return uniqueRefs;
};

// Prompt template for structured assessment focused on Swiss law
const createPrompt = (userText: string, dsgContext: DsgArticle[]): string => {
  const contextText =
    dsgContext && dsgContext.length > 0
      ? dsgContext
          .map(
            (a) =>
              `${a.id}${a.heading ? ` – ${a.heading}` : ''}: ${a.text
                .replace(/\s+/g, ' ')
                .trim()}`
          )
          .join('\n\n')
      : 'Kein zusätzlicher DSG-Kontext verfügbar.';

  return `You are an expert legal evaluator specializing in Swiss law. Analyse the following input text strictly from the perspective of Swiss legal framework, including but not limited to:

- Swiss Federal Constitution (Bundesverfassung, BV, SR 101)
- Swiss Civil Code (Zivilgesetzbuch, ZGB, SR 210)
- Swiss Code of Obligations (Obligationenrecht, OR, SR 220)
- Swiss Data Protection Act (Datenschutzgesetz, DSG, SR 235.1)
- Swiss Penal Code (Strafgesetzbuch, StGB, SR 311.0)
- Relevant cantonal laws where applicable

IMPORTANT: Only provide assessments based on Swiss law. If the text relates to legal matters outside Switzerland, note that your assessment is limited to Swiss legal perspective.

CRITICAL: When referencing Swiss laws, you MUST cite them in the exact format: "Art. [number] [law abbreviation]" or "Art. [number] Abs. [paragraph] [law abbreviation]"
Examples: "Art. 5 DSG", "Art. 12 Abs. 1 ZGB", "Art. 28 OR", "Art. 13 BV"

LANGUAGE REQUIREMENT: Write every part of the assessment (summary, risk justification, recommendations, and any explanations) exclusively in German. Do not switch languages. Keep the structural labels (SUMMARY, RISK_LEVEL, JUSTIFICATION, RECOMMENDATIONS) exactly as specified below, but ensure the content that follows each label is fully German.

1. Provide a concise 2–3 sentence summary from a Swiss legal perspective, including specific legal citations.
2. Give a risk assessment: LOW, MEDIUM or HIGH based on compliance with Swiss law. Include a one-sentence justification with EXACT legal citations (e.g., "Art. 5 DSG").
3. Provide 3–5 improvement recommendations as bullet points, each with specific Swiss legal citations in the format "Art. X [LAW]" or "Art. X Abs. Y [LAW]".

Kontext aus DSG (automatisch ausgewählte Passagen, bitte berücksichtigen):
${contextText}

Text to analyse:

"${userText}"

Please format your response as follows:
SUMMARY: [your summary here with legal citations]
RISK_LEVEL: [LOW|MEDIUM|HIGH]
JUSTIFICATION: [one sentence justification with exact Swiss law citation, e.g., "Art. 5 DSG"]
RECOMMENDATIONS:
- [recommendation 1 with citation, e.g., "Art. 12 ZGB"]
- [recommendation 2 with citation]
- [recommendation 3 with citation]
- [recommendation 4 with citation]
- [recommendation 5 with citation]`;
};

// Parse the model response to extract structured data
const parseResponse = (response: string): {
  summary: string;
  riskLevel: string;
  analysis: string;
  recommendations: string[];
  legalReferences: LegalReference[];
} => {
  const analysis = response;
  
  // Extract summary
  const summaryMatch = response.match(/SUMMARY:\s*(.+?)(?=RISK_LEVEL:|$)/is);
  const summary = summaryMatch ? summaryMatch[1].trim() : 'No summary provided.';
  
  // Extract risk level
  const riskMatch = response.match(/RISK_LEVEL:\s*(LOW|MEDIUM|HIGH)/i);
  const riskLevel = riskMatch ? riskMatch[1].toUpperCase() : 'UNKNOWN';
  
  // Extract recommendations
  const recommendationsMatch = response.match(/RECOMMENDATIONS:\s*([\s\S]+?)(?=\n\n|$)/i);
  const recommendationsText = recommendationsMatch ? recommendationsMatch[1] : '';
  const recommendations = recommendationsText
    .split('\n')
    .map(line => line.replace(/^[-•*]\s*/, '').trim())
    .filter(line => line.length > 0);
  
  // Extract all legal references from the entire response
  const legalReferences = extractLegalReferences(response);
  
  return {
    summary,
    riskLevel,
    analysis,
    recommendations: recommendations.length > 0 ? recommendations : ['No recommendations provided.'],
    legalReferences
  };
};

// API endpoint to get available models
app.get('/api/models', (req: Request, res: Response) => {
  res.json({
    models: OPENROUTER_MODELS,
    defaultModel: OPENROUTER_MODEL
  });
});

// API endpoint for text analysis
app.post('/api/analyze', async (req: Request, res: Response) => {
  try {
    const { text, model } = req.body;
    
    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return res.status(400).json({ error: 'Text input is required' });
    }
    
    // Check if OpenRouter API key is configured
    if (!OPENROUTER_API_KEY) {
      return res.status(503).json({ 
        error: 'OPENROUTER_API_KEY fehlt – Bitte setzen Sie OPENROUTER_API_KEY in Ihrer Umgebungsvariablen.' 
      });
    }
    
    // Retrieve DSG articles - always include ALL articles for comprehensive context
    const dsgContext = DSG_ARTICLES; // Include ALL 77 articles every time
    const prompt = createPrompt(text, dsgContext);
    const requestedModel = typeof model === 'string' && model.trim().length > 0 
      ? model.trim() 
      : OPENROUTER_MODEL;

    console.log(`Using OpenRouter with model: ${requestedModel}`);

    // Call OpenRouter API
    const openRouterResponse = await axios.post(
      `${OPENROUTER_BASE_URL}/chat/completions`,
      {
        model: requestedModel,
        messages: [
          { role: 'user', content: prompt }
        ],
        temperature: 0.2
      },
      {
        timeout: 120000,
        headers: {
          Authorization: `Bearer ${OPENROUTER_API_KEY}`,
          'HTTP-Referer': OPENROUTER_APP_URL,
          'X-Title': 'Swiss Legal Assessment'
        }
      }
    );
    
    const modelResponse = openRouterResponse.data?.choices?.[0]?.message?.content || '';
    const parsed = parseResponse(modelResponse);
    
    res.json({
      summary: parsed.summary,
      riskLevel: parsed.riskLevel,
      analysis: parsed.analysis,
      recommendations: parsed.recommendations,
      legalReferences: parsed.legalReferences || []
    });
    
  } catch (error: any) {
    console.error('Error analyzing text:', error);
    
    if (error.code === 'ECONNREFUSED') {
      return res.status(503).json({ 
        error: 'Cannot connect to OpenRouter. Please verify OPENROUTER_BASE_URL and API key.' 
      });
    }
    
    if (error.response) {
      return res.status(500).json({ 
        error: `OpenRouter API error: ${error.response.data?.error?.message || error.response.data?.error || error.message}` 
      });
    }
    
    res.status(500).json({ 
      error: `Internal server error: ${error.message}` 
    });
  }
});

// Serve React app for all other routes (production only)
if (process.env.NODE_ENV === 'production') {
  app.get('*', (req: Request, res: Response) => {
    res.sendFile(path.join(__dirname, '../client-dist/index.html'));
  });
}

// Start server
if (process.env.NODE_ENV !== 'production' || process.env.VERCEL !== '1') {
  // Only start Express server if not on Vercel (Vercel handles this automatically)
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    
    if (OPENROUTER_API_KEY) {
      console.log(`OpenRouter configured: ${OPENROUTER_BASE_URL}`);
      console.log(`OpenRouter available models: ${OPENROUTER_MODELS.join(', ')}`);
      console.log(`OpenRouter default model: ${OPENROUTER_MODEL}`);
      console.log(`OpenRouter app URL: ${OPENROUTER_APP_URL}`);
      console.log('OpenRouter is ready for use.');
    } else {
      console.warn('⚠️  WARNING: OPENROUTER_API_KEY not set. API calls will fail.');
    }
  });
}

// Export for Vercel serverless functions
export default app;
