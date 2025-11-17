import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import axios from 'axios';
import path from 'path';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;
const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://localhost:11434';

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

  // Check password for API endpoints
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
  'BV': 'https://www.fedlex.admin.ch/de/eli/cc/1999/404/de',
  'Bundesverfassung': 'https://www.fedlex.admin.ch/de/eli/cc/1999/404/de',
  'SR 101': 'https://www.fedlex.admin.ch/de/eli/cc/1999/404/de',
  
  // Civil Code (ZGB, SR 210)
  'ZGB': 'https://www.fedlex.admin.ch/de/eli/cc/24/233_245_277/de',
  'Zivilgesetzbuch': 'https://www.fedlex.admin.ch/de/eli/cc/24/233_245_277/de',
  'SR 210': 'https://www.fedlex.admin.ch/de/eli/cc/24/233_245_277/de',
  
  // Code of Obligations (OR, SR 220)
  'OR': 'https://www.fedlex.admin.ch/de/eli/cc/27/317_321_377/de',
  'Obligationenrecht': 'https://www.fedlex.admin.ch/de/eli/cc/27/317_321_377/de',
  'SR 220': 'https://www.fedlex.admin.ch/de/eli/cc/27/317_321_377/de',
  
  // Data Protection Act (DSG, SR 235.1)
  // Using search URL format that will find the law in the systematic collection
  // The direct URL format may not work due to JavaScript requirements
  'DSG': 'https://www.fedlex.admin.ch/de/filestore/fedlex.data.admin.ch/eli/cc/27/757_781_799/20230801/de',
  'Datenschutzgesetz': 'https://www.fedlex.admin.ch/de/filestore/fedlex.data.admin.ch/eli/cc/27/757_781_799/20230801/de',
  'DSG 2023': 'https://www.fedlex.admin.ch/de/filestore/fedlex.data.admin.ch/eli/cc/27/757_781_799/20230801/de',
  'SR 235.1': 'https://www.fedlex.admin.ch/de/filestore/fedlex.data.admin.ch/eli/cc/27/757_781_799/20230801/de',
  
  // Penal Code (StGB, SR 311.0)
  'StGB': 'https://www.fedlex.admin.ch/de/eli/cc/54/757_781_799/de',
  'Strafgesetzbuch': 'https://www.fedlex.admin.ch/de/eli/cc/54/757_781_799/de',
  'SR 311.0': 'https://www.fedlex.admin.ch/de/eli/cc/54/757_781_799/de',
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
const createPrompt = (userText: string): string => {
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

1. Provide a concise 2–3 sentence summary from a Swiss legal perspective, including specific legal citations.
2. Give a risk assessment: LOW, MEDIUM or HIGH based on compliance with Swiss law. Include a one-sentence justification with EXACT legal citations (e.g., "Art. 5 DSG").
3. Provide 3–5 improvement recommendations as bullet points, each with specific Swiss legal citations in the format "Art. X [LAW]" or "Art. X Abs. Y [LAW]".

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

// API endpoint for text analysis
app.post('/api/analyze', async (req: Request, res: Response) => {
  try {
    const { text } = req.body;
    
    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return res.status(400).json({ error: 'Text input is required' });
    }
    
    const prompt = createPrompt(text);
    
    // Call Ollama API
    const ollamaResponse = await axios.post(
      `${OLLAMA_HOST}/api/generate`,
      {
        model: 'qwen3:4b',
        prompt: prompt,
        stream: false
      },
      {
        timeout: 60000 // 60 second timeout
      }
    );
    
    const modelResponse = ollamaResponse.data.response || '';
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
        error: 'Cannot connect to Ollama. Please ensure Ollama is running and the model is pulled (ollama pull qwen3:4b)' 
      });
    }
    
    if (error.response) {
      return res.status(500).json({ 
        error: `Ollama API error: ${error.response.data?.error || error.message}` 
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
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Ollama host: ${OLLAMA_HOST}`);
});

