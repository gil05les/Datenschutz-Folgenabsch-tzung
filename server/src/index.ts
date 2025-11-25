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

  // Skip password check for public endpoints (auth verify and models list)
  // Auth verify endpoint handles its own password validation
  if (req.path === '/api/models' || req.path === '/api/auth/verify') {
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

// Prompt template for structured DSFA according to EDÖB guidelines
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

  return `Du bist ein Experte für Datenschutzrecht in der Schweiz und erstellst eine Datenschutz-Folgenabschätzung (DSFA) gemäss den Art. 22 und 23 DSG sowie dem Merkblatt des Eidgenössischen Datenschutz- und Öffentlichkeitsbeauftragten (EDÖB).

WICHTIG: Alle Ausführungen müssen auf Schweizer Recht basieren, insbesondere:
- Bundesverfassung (BV, SR 101)
- Datenschutzgesetz (DSG, SR 235.1)
- Zivilgesetzbuch (ZGB, SR 210)
- Obligationenrecht (OR, SR 220)
- Strafgesetzbuch (StGB, SR 311.0)
- Relevante kantonale Gesetze

KRITISCH: Bei Rechtsverweisen MÜSSEN Sie das exakte Format verwenden: "Art. [Nummer] [Gesetzesabkürzung]" oder "Art. [Nummer] Abs. [Absatz] [Gesetzesabkürzung]"
Beispiele: "Art. 22 DSG", "Art. 5 Abs. 2 ZGB", "Art. 28 OR"

SPRACHE: Alle Ausführungen müssen vollständig auf Deutsch verfasst sein. Die Strukturlabels (ZUSAMMENFASSUNG, BESCHREIBUNG, BRUTTORISIKEN, MASSNAHMEN, NETTORISIKEN, ERGEBNIS, RISK_LEVEL) müssen exakt beibehalten werden.

Erstelle eine strukturierte DSFA gemäss EDÖB-Standard:

1. ZUSAMMENFASSUNG: Eine prägnante 2-3 Sätze Zusammenfassung der geplanten Datenbearbeitung mit rechtlichen Einordnungen und Zitaten.

2. BESCHREIBUNG DER GE PLANTEN BEARBEITUNG:
- Zweck der Datenbearbeitung
- Art der betroffenen Personen
- Datenkategorien (Personendaten, besonders schützenswerte Daten gemäss Art. 5 DSG)
- Umfang der Datenbearbeitung
- Technische Umsetzung und verwendete Technologien
- Rechtliche Grundlage bzw. Rechtfertigungsgrund
Prüfe insbesondere die Kriterien nach Art. 22 Abs. 2 DSG:
  - Art der Bearbeitung
  - Umfang der Bearbeitung
  - Umstände der Bearbeitung
  - Zweck der Bearbeitung
  - Absolute Kriterien (Art. 22 Abs. 2 Bst. a/b DSG): umfangreiche Bearbeitung besonders schützenswerter Daten oder systematische umfangreiche Überwachung öffentlicher Bereiche

3. POTENTIELL HOHE BRUTTORISIKEN (vor Massnahmen):
Analysiere die Risiken für die primären Schutzobjekte:
  a) Primärrisiken für Privatsphäre und informationelle Selbstbestimmung der Betroffenen
     - Einschränkung der Verfügungsfreiheit über eigene Daten
     - Verletzung der Privatsphäre
     - Beeinträchtigung der Autonomie, Würde und Identität
  b) Sekundärrisiken für weitere Rechtsgüter und Grundrechte
     - Recht auf Leben
     - Physische Unversehrtheit
     - Eigentum
     - Weitere Grundrechte
Für jedes identifizierte Risiko:
  - Beschreibe die Art des Risikos (systemisch, rechtlich, sicherheitstechnisch)
  - Bewerte die Eintrittswahrscheinlichkeit
  - Bewerte die Schwere der Auswirkungen
  - Nenne die betroffenen Personen
  - Begründe, warum es als "hoch" einzustufen ist (mit Rechtszitaten, z.B. "Art. 22 Abs. 1 DSG")

4. GEPLANTE MASSNAHMEN ZUR SENKUNG DER BRUTTORISIKEN:
Vorschlage konkrete Massnahmen zur Risikosenkung:
  a) Rechtliche Massnahmen (z.B. Verträge, SCC, Datenschutzerklärungen gemäss Art. 19 DSG)
  b) Organisatorische Massnahmen (z.B. Schulung des Personals, Zugriffskontrollen, Datenschutzberater gemäss Art. 10 DSG)
  c) Technische Massnahmen (z.B. Verschlüsselung gemäss Art. 8 DSG, Pseudonymisierung, Privacy by Design/Default gemäss Art. 7 DSG)
Für jede Massnahme: Erkläre, wie sie das Risiko senkt und nenne relevante Rechtsgrundlagen.

5. VERBLEIBENDE NETTORISIKEN (nach Massnahmen):
Bewerte die Risiken nach den geplanten Massnahmen:
  - Welche Risiken können durch die Massnahmen auf ein akzeptables Niveau gesenkt werden?
  - Welche Risiken bleiben trotz Massnahmen hoch?
  - Gibt es Risiken, die nicht beeinflussbar oder verlässlich einschätzbar sind? (z.B. Zugriffe fremder Behörden bei Datenexport)
  - Sind die verbleibenden Nettorisiken mit der Datenschutzgesetzgebung als Ganzes vereinbar?
  - Prüfe insbesondere die Verhältnismässigkeit gemäss Art. 6 DSG

6. ERGEBNIS:
- Ist ein hohes Nettorisiko vorhanden? (Ja/Nein)
- Falls ja: Ist das hohe Nettorisiko datenschutzrechtlich akzeptabel oder inakzeptabel?
- Begründe die Bewertung mit Rechtszitaten (z.B. "Art. 23 Abs. 1 DSG", "Art. 6 DSG")
- Ist gemäss Art. 23 Abs. 1 DSG eine Vorlage beim EDÖB erforderlich?

7. RISK_LEVEL: [LOW|MEDIUM|HIGH]
Bestimme das Gesamtrisiko-Niveau basierend auf den Nettorisiken:
- LOW: Keine oder nur geringe Nettorisiken, keine DSFA-Vorlagepflicht
- MEDIUM: Erhöhte Risiken, die durch Massnahmen weitgehend gemindert werden können
- HIGH: Hohe Nettorisiken trotz Massnahmen, möglicherweise Vorlagepflicht beim EDÖB gemäss Art. 23 Abs. 1 DSG

Kontext aus DSG (alle relevanten Artikel):
${contextText}

Zu analysierender Text:

"${userText}"

FORMATIERUNGSREGELN FÜR PDF-OPTIMIERTE AUSGABE:
- VERWENDE KEIN MARKDOWN (keine **, keine ###, keine Code-Formatierung)
- Verwende klare Absätze und Aufzählungen
- Nummeriere Aufzählungen mit Ziffern oder Buchstaben in Klammern: (1), (2), (a), (b), (c)
- Verwende einfache Listen mit Bindestrichen oder Nummern
- Jede Massnahme sollte auf einer eigenen Zeile beginnen
- Strukturierte Abschnitte sollten mit klaren Überschriften beginnen

Bitte formatiere deine Antwort exakt wie folgt (alle Abschnitte müssen vorhanden sein):

ZUSAMMENFASSUNG:
[Deine Zusammenfassung hier mit Rechtszitaten - als fliessender Text, 2-3 Sätze]

BESCHREIBUNG DER GE PLANTEN BEARBEITUNG:
[Strukturierte Beschreibung als fliessender Text mit klaren Absätzen für jeden Punkt. Verwende KEINE Markdown-Formatierung. Strukturiere mit einfachen Absätzen, nicht mit Markdown-Listen.]

POTENTIELL HOHE BRUTTORISIKEN:
[Strukturierte Auflistung als fliessender Text. Beginne mit "Primärrisiken für Privatsphäre und informationelle Selbstbestimmung:" gefolgt von den identifizierten Risiken. Dann "Sekundärrisiken für weitere Rechtsgüter und Grundrechte:" gefolgt von den Risiken. Verwende KEINE Markdown-Formatierung, sondern klare Absätze.]

GEPLANTE MASSNAHMEN ZUR SENKUNG DER BRUTTORISIKEN:
[Liste die Massnahmen klar strukturiert auf, aber OHNE Markdown. Verwende folgende Struktur:

(1) Rechtliche Massnahmen:
    - Massnahme 1 mit Begründung und Rechtszitat
    - Massnahme 2 mit Begründung und Rechtszitat

(2) Organisatorische Massnahmen:
    - Massnahme 1 mit Begründung und Rechtszitat
    - Massnahme 2 mit Begründung und Rechtszitat

(3) Technische Massnahmen:
    - Massnahme 1 mit Begründung und Rechtszitat
    - Massnahme 2 mit Begründung und Rechtszitat

Jede Massnahme sollte klar beschrieben sein mit: Was wird gemacht, warum senkt es das Risiko, welches Rechtszitat ist relevant.]

VERBLEIBENDE NETTORISIKEN:
[Bewertung der Nettorisiken nach den Massnahmen als fliessender Text mit klaren Aussagen]

ERGEBNIS:
[Strukturiertes Ergebnis als fliessender Text. Beantworte: Ist ein hohes Nettorisiko vorhanden? (Ja/Nein). Falls ja oder nein, begründe kurz mit Rechtszitaten. Ist eine Vorlage beim EDÖB erforderlich? (Ja/Nein gemäss Art. 23 Abs. 1 DSG)]

RISK_LEVEL: [LOW|MEDIUM|HIGH]

EMPFEHLUNGEN:
[Extrahiere aus den MASSNAHMEN die wichtigsten 3-5 konkreten Handlungsempfehlungen als einfache, nummerierte Liste. Jede Empfehlung sollte eine konkrete, umsetzbare Massnahme sein mit Rechtszitat. Format: 
1. Konkrete Empfehlung (Art. X DSG)
2. Konkrete Empfehlung (Art. Y DSG)
usw.]`;
};

// Helper function to clean markdown and formatting from text
const cleanMarkdown = (text: string): string => {
  if (!text) return text;
  return text
    // Remove bold/italic markdown
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    // Remove code blocks
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`([^`]+)`/g, '$1')
    // Remove headers
    .replace(/^#{1,6}\s+/gm, '')
    // Clean up extra whitespace
    .replace(/\n{3,}/g, '\n\n')
    .trim();
};

// Parse the model response to extract structured DSFA data
const parseResponse = (response: string): {
  summary: string;
  riskLevel: string;
  analysis: string;
  recommendations: string[];
  legalReferences: LegalReference[];
  description?: string;
  bruttorisiken?: string;
  massnahmen?: string;
  nettorisiken?: string;
  ergebnis?: string;
} => {
  const analysis = response;
  
  // Extract summary (either old format "SUMMARY:" or new format "ZUSAMMENFASSUNG:")
  const summaryMatch = response.match(/(?:SUMMARY|ZUSAMMENFASSUNG):\s*(.+?)(?=(?:BESCHREIBUNG|DESCRIPTION|BRUTTORISIKEN|RISK_LEVEL|$))/is);
  const summary = summaryMatch ? cleanMarkdown(summaryMatch[1].trim()) : 'Keine Zusammenfassung vorhanden.';
  
  // Extract description of planned processing
  const descriptionMatch = response.match(/BESCHREIBUNG[^:]*:\s*(.+?)(?=(?:POTENTIELL|BRUTTORISIKEN|MASSNAHMEN|$))/is);
  const description = descriptionMatch ? cleanMarkdown(descriptionMatch[1].trim()) : undefined;
  
  // Extract bruttorisiken (brutto risks)
  const bruttorisikenMatch = response.match(/POTENTIELL[^:]*BRUTTORISIKEN[^:]*:\s*(.+?)(?=(?:GEPLANTE|MASSNAHMEN|NETTORISIKEN|$))/is);
  const bruttorisiken = bruttorisikenMatch ? cleanMarkdown(bruttorisikenMatch[1].trim()) : undefined;
  
  // Extract massnahmen (measures)
  const massnahmenMatch = response.match(/GEPLANTE[^:]*MASSNAHMEN[^:]*:\s*(.+?)(?=(?:VERBLEIBENDE|NETTORISIKEN|ERGEBNIS|RISK_LEVEL|EMPFEHLUNGEN|$))/is);
  const massnahmen = massnahmenMatch ? cleanMarkdown(massnahmenMatch[1].trim()) : undefined;
  
  // Extract nettorisiken (net risks)
  const nettorisikenMatch = response.match(/VERBLEIBENDE[^:]*NETTORISIKEN[^:]*:\s*(.+?)(?=(?:ERGEBNIS|RISK_LEVEL|EMPFEHLUNGEN|$))/is);
  const nettorisiken = nettorisikenMatch ? cleanMarkdown(nettorisikenMatch[1].trim()) : undefined;
  
  // Extract ergebnis (result)
  const ergebnisMatch = response.match(/ERGEBNIS:\s*(.+?)(?=(?:RISK_LEVEL|EMPFEHLUNGEN|$))/is);
  const ergebnis = ergebnisMatch ? cleanMarkdown(ergebnisMatch[1].trim()) : undefined;
  
  // Extract risk level (support both old and new format)
  const riskMatch = response.match(/RISK_LEVEL:\s*(LOW|MEDIUM|HIGH)/i);
  const riskLevel = riskMatch ? riskMatch[1].toUpperCase() : 'UNKNOWN';
  
  // Extract recommendations - check for new EMPFEHLUNGEN section first
  let recommendations: string[] = [];
  
  // Try to extract from dedicated EMPFEHLUNGEN section (new format)
  const empfehlungenMatch = response.match(/EMPFEHLUNGEN:\s*([\s\S]+?)(?=(?:RISK_LEVEL|$))/i);
  if (empfehlungenMatch) {
    const empfehlungenText = cleanMarkdown(empfehlungenMatch[1]);
    recommendations = empfehlungenText
      .split('\n')
      .map(line => {
        // Remove leading numbers, bullets, dashes, or letters in parentheses
        line = line.replace(/^[\d]+[\.\)]\s*/, ''); // Remove "1. " or "1) "
        line = line.replace(/^[\(][a-zA-Z][\)]\s*/, ''); // Remove "(a) " or "(A) "
        line = line.replace(/^[-•*]\s*/, ''); // Remove "- " or "* " or "• "
        return line.trim();
      })
      .filter(line => line.length > 10 && !line.match(/^[\(][\d]+[\)]\s*$/)) // Filter out very short lines and standalone numbers
      .slice(0, 10); // Limit to 10 items
  }
  
  // If no recommendations found, try extracting from MASSNAHMEN section
  if (recommendations.length === 0 && massnahmen) {
    // Extract individual actionable measures from massnahmen
    const lines = massnahmen.split('\n');
    recommendations = lines
      .map(line => {
        line = cleanMarkdown(line);
        // Look for lines that start with numbers, letters in parentheses, or dashes
        if (line.match(/^[\d]+[\.\)]\s+|^[\(][a-zA-Z][\)]\s+|^[-•*]\s+/)) {
          line = line.replace(/^[\d]+[\.\)]\s*/, '');
          line = line.replace(/^[\(][a-zA-Z][\)]\s*/, '');
          line = line.replace(/^[-•*]\s*/, '');
          // Extract the actual recommendation text (before any additional explanations)
          const parts = line.split(':');
          if (parts.length > 1) {
            return parts.slice(1).join(':').trim(); // Take everything after the colon
          }
          return line.trim();
        }
        return null;
      })
      .filter((line): line is string => line !== null && line.length > 10)
      .slice(0, 10);
  }
  
  // If still no recommendations found, try old format
  if (recommendations.length === 0) {
    const recommendationsMatch = response.match(/RECOMMENDATIONS:\s*([\s\S]+?)(?=\n\n|$)/i);
    const recommendationsText = recommendationsMatch ? cleanMarkdown(recommendationsMatch[1]) : '';
    recommendations = recommendationsText
      .split('\n')
      .map(line => {
        line = line.replace(/^[\d]+[\.\)]\s*/, '');
        line = line.replace(/^[\(][a-zA-Z][\)]\s*/, '');
        line = line.replace(/^[-•*]\s*/, '');
        return line.trim();
      })
      .filter(line => line.length > 0);
  }
  
  // Extract all legal references from the entire response
  const legalReferences = extractLegalReferences(response);
  
  return {
    summary,
    riskLevel,
    analysis,
    recommendations: recommendations.length > 0 ? recommendations : ['Keine Empfehlungen vorhanden.'],
    legalReferences,
    description,
    bruttorisiken,
    massnahmen,
    nettorisiken,
    ergebnis
  };
};

// API endpoint to verify password
app.post('/api/auth/verify', (req: Request, res: Response) => {
  const providedPassword = req.headers['x-app-password'] || req.body?.password;
  
  if (!providedPassword || providedPassword !== APP_PASSWORD) {
    return res.status(401).json({ 
      error: 'Ungültiges Passwort. Bitte versuchen Sie es erneut.',
      requiresPassword: true 
    });
  }
  
  res.json({ 
    success: true,
    message: 'Passwort korrekt'
  });
});

// API endpoint to get available models (requires password)
app.get('/api/models', (req: Request, res: Response) => {
  const providedPassword = req.headers['x-app-password'];
  
  // Optional password check for models endpoint - if password provided, validate it
  if (providedPassword && providedPassword !== APP_PASSWORD) {
    return res.status(401).json({ 
      error: 'Ungültiges Passwort.',
      requiresPassword: true 
    });
  }
  
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
      legalReferences: parsed.legalReferences || [],
      // New DSFA structure fields
      description: parsed.description,
      bruttorisiken: parsed.bruttorisiken,
      massnahmen: parsed.massnahmen,
      nettorisiken: parsed.nettorisiken,
      ergebnis: parsed.ergebnis
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
