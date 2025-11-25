import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import jsPDF from 'jspdf';
import './App.css';

interface LegalReference {
  law: string;
  article?: string;
  paragraph?: string;
  text: string;
  url: string;
}

interface AnalysisResult {
  summary: string;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'UNKNOWN';
  analysis: string;
  recommendations: string[];
  legalReferences: LegalReference[];
  // New DSFA structure fields
  description?: string;
  bruttorisiken?: string;
  massnahmen?: string;
  nettorisiken?: string;
  ergebnis?: string;
}

// Icon Components
// Scales of Justice - Lucide style
const SwissLegalIcon = () => (
  <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"></path>
    <path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"></path>
    <path d="M7 21h10"></path>
    <path d="M12 3v18"></path>
    <path d="M3 7h2c2 0 5 1 7 3 2-2 5-3 7-3h2"></path>
  </svg>
);

const SearchIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8"></circle>
    <path d="m21 21-4.35-4.35"></path>
  </svg>
);

const ClipboardIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path>
    <rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect>
  </svg>
);

const ShieldIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
  </svg>
);

const LightbulbIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 21h6"></path>
    <path d="M12 3a6 6 0 0 0 6 6c0 2.5-1 4.5-3 6"></path>
    <path d="M12 3a6 6 0 0 1-6 6c0 2.5 1 4.5 3 6"></path>
    <path d="M12 15v3"></path>
  </svg>
);

const FileIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
    <polyline points="14 2 14 8 20 8"></polyline>
  </svg>
);

const AlertIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"></path>
    <line x1="12" y1="9" x2="12" y2="13"></line>
    <line x1="12" y1="17" x2="12.01" y2="17"></line>
  </svg>
);

const CheckIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12"></polyline>
  </svg>
);

const WarningIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"></path>
    <line x1="12" y1="9" x2="12" y2="13"></line>
    <line x1="12" y1="17" x2="12.01" y2="17"></line>
  </svg>
);

const MoonIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
  </svg>
);

const SunIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="5"></circle>
    <line x1="12" y1="1" x2="12" y2="3"></line>
    <line x1="12" y1="21" x2="12" y2="23"></line>
    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
    <line x1="1" y1="12" x2="3" y2="12"></line>
    <line x1="21" y1="12" x2="23" y2="12"></line>
    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
    <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
  </svg>
);

const ExternalLinkIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
    <polyline points="15 3 21 3 21 9"></polyline>
    <line x1="10" y1="14" x2="21" y2="3"></line>
  </svg>
);

const LogoutIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
    <polyline points="16 17 21 12 16 7"></polyline>
    <line x1="21" y1="12" x2="9" y2="12"></line>
  </svg>
);

// Component to render text with clickable legal citations
function TextWithCitations({ text, references }: { text: string; references: LegalReference[] }) {
  if (references.length === 0) {
    return <>{text}</>;
  }

  // Create a map of citation text to reference
  const citationMap = new Map<string, LegalReference>();
  references.forEach(ref => {
    citationMap.set(ref.text, ref);
  });

  // Split text by citations and create clickable links
  const parts: (string | JSX.Element)[] = [];
  let lastIndex = 0;
  let key = 0;

  // Find all citations in the text
  const citationPatterns = references.map(ref => ({
    pattern: new RegExp(ref.text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'),
    ref: ref
  }));

  const matches: Array<{ index: number; length: number; ref: LegalReference }> = [];
  citationPatterns.forEach(({ pattern, ref }) => {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      matches.push({
        index: match.index,
        length: match[0].length,
        ref: ref
      });
    }
  });

  // Sort matches by index
  matches.sort((a, b) => a.index - b.index);

  // Build the parts array
  matches.forEach(match => {
    // Add text before citation
    if (match.index > lastIndex) {
      parts.push(text.substring(lastIndex, match.index));
    }

    // Add clickable citation
    const citationText = text.substring(match.index, match.index + match.length);
    parts.push(
      <a
        key={key++}
        href={match.ref.url}
        target="_blank"
        rel="noopener noreferrer"
        className="legal-citation"
        title={`Öffnet ${match.ref.text} auf fedlex.admin.ch`}
      >
        {citationText}
        <ExternalLinkIcon />
      </a>
    );

    lastIndex = match.index + match.length;
  });

  // Add remaining text
  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex));
  }

  return <>{parts.length > 0 ? parts : text}</>;
}

function Dashboard() {
  const navigate = useNavigate();
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [model, setModel] = useState('x-ai/grok-4.1-fast:free');
  const [availableModels, setAvailableModels] = useState<string[]>(['x-ai/grok-4.1-fast:free']);
  const password = localStorage.getItem('appPassword') || '';
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem('darkMode');
    return saved ? JSON.parse(saved) : false;
  });

  const handleLogout = () => {
    localStorage.removeItem('appPassword');
    navigate('/');
  };

  // Load available models from server on mount
  useEffect(() => {
    const password = localStorage.getItem('appPassword');
    if (!password) return;
    
    fetch('/api/models', {
      headers: {
        'X-App-Password': password,
      },
    })
      .then(res => {
        if (!res.ok) {
          throw new Error('Unauthorized');
        }
        return res.json();
      })
      .then(data => {
        if (data.models && data.models.length > 0) {
          setAvailableModels(data.models);
          if (data.defaultModel) {
            setModel(data.defaultModel);
          }
        }
      })
      .catch(err => {
        console.warn('Could not load available models:', err);
        // Keep default model
      });
  }, []);

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('darkMode', JSON.stringify(darkMode));
  }, [darkMode]);


  // Scroll animation observer
  useEffect(() => {
    const observerOptions = {
      threshold: 0.1,
      rootMargin: '0px 0px -50px 0px',
    };

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('animate-in-view');
        }
      });
    }, observerOptions);

    const elements = document.querySelectorAll('.scroll-animate');
    elements.forEach((el) => observer.observe(el));

    return () => {
      elements.forEach((el) => observer.unobserve(el));
    };
  }, [result]);

  const handleAnalyze = async () => {
    if (!text.trim()) {
      setError('Bitte geben Sie einen Text zur Analyse ein');
      return;
    }

    if (!password) {
      setError('Bitte melden Sie sich an');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-App-Password': password,
        },
        body: JSON.stringify({ text, password, model }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        if (errorData.requiresPassword || response.status === 401) {
          localStorage.removeItem('appPassword');
          window.location.href = '/';
        }
        throw new Error(errorData.error || 'Failed to analyze text');
      }

      const data = await response.json();
      setResult(data);
    } catch (err: any) {
      setError(err.message || 'An error occurred while analyzing the text');
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadPdf = () => {
    if (!result) {
      return;
    }

    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    const marginX = 48;
    const marginY = 60;
    const lineHeight = 18;
    const pageWidth = doc.internal.pageSize.getWidth();
    const contentWidth = pageWidth - marginX * 2;
    let cursorY = marginY;

    const ensureSpace = (height = lineHeight) => {
      const pageHeight = doc.internal.pageSize.getHeight();
      if (cursorY + height > pageHeight - marginY) {
        doc.addPage();
        cursorY = marginY;
      }
    };

    const writeLines = (lines: string[], offset = 0) => {
      lines.forEach((line) => {
        ensureSpace();
        doc.text(line, marginX + offset, cursorY);
        cursorY += lineHeight;
      });
    };

    const addSectionTitle = (title: string) => {
      ensureSpace(lineHeight * 2);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(16);
      doc.setTextColor(26, 46, 58);
      doc.text(title, marginX, cursorY);
      cursorY += lineHeight / 2;
      doc.setDrawColor(119, 177, 212);
      doc.setLineWidth(1.2);
      doc.line(marginX, cursorY, marginX + 80, cursorY);
      cursorY += lineHeight;
    };

    // Helper function to clean markdown from text
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

    const addParagraph = (textValue: string) => {
      if (!textValue?.trim()) {
        return;
      }
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(12);
      doc.setTextColor(26, 46, 58);
      const cleanedText = cleanMarkdown(textValue.trim());
      const lines = doc.splitTextToSize(cleanedText, contentWidth);
      writeLines(lines);
      cursorY += 6;
    };

    const addMultilineBlock = (textValue: string) => {
      const cleanedText = cleanMarkdown(textValue);
      cleanedText
        .split(/\n+/)
        .map((paragraph) => {
          // Remove leading markers that might remain
          paragraph = paragraph.replace(/^[\d]+[\.\)]\s*/, '');
          paragraph = paragraph.replace(/^[\(][a-zA-Z][\)]\s*/, '');
          paragraph = paragraph.replace(/^[-•*]\s*/, '');
          return paragraph.trim();
        })
        .filter(Boolean)
        .forEach(addParagraph);
    };

    const addNumberedList = (items: string[]) => {
      if (!items?.length) {
        return;
      }

      items.forEach((item, index) => {
        // Clean markdown from item
        let cleanedItem = cleanMarkdown(item);
        
        // Remove leading numbers, bullets, or other markers that might be left
        cleanedItem = cleanedItem.replace(/^[\d]+[\.\)]\s*/, '');
        cleanedItem = cleanedItem.replace(/^[\(][a-zA-Z][\)]\s*/, '');
        cleanedItem = cleanedItem.replace(/^[-•*]\s*/, '');
        cleanedItem = cleanedItem.trim();
        
        if (!cleanedItem) return;
        
        ensureSpace();
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        doc.setTextColor(87, 185, 255);
        doc.text(`${index + 1}.`, marginX, cursorY);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(26, 46, 58);
        const lines = doc.splitTextToSize(cleanedItem, contentWidth - 30);
        let lineCursor = cursorY;
        lines.forEach((line: string, lineIndex: number) => {
          if (lineIndex > 0) {
            lineCursor += lineHeight;
            ensureSpace();
          }
          doc.text(line, marginX + 30, lineCursor);
        });
        cursorY = lineCursor + lineHeight + 4;
      });
    };

    // Header
    doc.setFillColor(240, 248, 255);
    doc.rect(0, 0, pageWidth, 105, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(22);
    doc.setTextColor(26, 46, 58);
    doc.text('Swiss Legal Assessment', marginX, 50);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(12);
    doc.setTextColor(81, 120, 145);
    const timestamp = new Intl.DateTimeFormat('de-CH', {
      dateStyle: 'full',
      timeStyle: 'short',
    }).format(new Date());
    doc.text(`Erstellt am ${timestamp}`, marginX, 70);
    doc.text('Datenschutz-Folgenabschätzung basierend auf Schweizer Recht', marginX, 88);
    cursorY = 130;

    addSectionTitle('Zusammenfassung');
    addParagraph(result.summary);

    // DSFA Structure Sections in PDF
    if (result.description) {
      addSectionTitle('Beschreibung der geplanten Bearbeitung');
      addMultilineBlock(result.description);
    }

    if (result.bruttorisiken) {
      addSectionTitle('Potentiell hohe Bruttorisiken');
      addMultilineBlock(result.bruttorisiken);
    }

    if (result.massnahmen) {
      addSectionTitle('Geplante Massnahmen zur Senkung der Bruttorisiken');
      addMultilineBlock(result.massnahmen);
    }

    if (result.nettorisiken) {
      addSectionTitle('Verbleibende Nettorisiken');
      addMultilineBlock(result.nettorisiken);
    }

    if (result.ergebnis) {
      addSectionTitle('Ergebnis');
      addMultilineBlock(result.ergebnis);
    }

    const riskStyles: Record<
      AnalysisResult['riskLevel'],
      { label: string; description: string; color: [number, number, number]; background: [number, number, number] }
    > = {
      LOW: { label: 'Niedrig', description: 'Geringes Risiko basierend auf der Modellbewertung', color: [87, 185, 255], background: [232, 244, 253] },
      MEDIUM: { label: 'Mittel', description: 'Moderates Risiko mit empfohlenen Folgeaktionen', color: [119, 177, 212], background: [208, 232, 245] },
      HIGH: { label: 'Hoch', description: 'Hohes Risiko – sofortige Maßnahmen empfohlen', color: [239, 68, 68], background: [254, 226, 226] },
      UNKNOWN: { label: 'Unbekannt', description: 'Risikostufe konnte nicht bestimmt werden', color: [119, 177, 212], background: [232, 244, 253] },
    };

    const riskConfig = riskStyles[result.riskLevel] || riskStyles.UNKNOWN;

    ensureSpace(110);
    doc.setFillColor(...riskConfig.background);
    doc.roundedRect(marginX, cursorY, contentWidth, 80, 12, 12, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(...riskConfig.color);
    doc.text('Risikobewertung', marginX + 20, cursorY + 28);
    doc.setFontSize(24);
    doc.text(riskConfig.label, marginX + 20, cursorY + 52);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(12);
    doc.setTextColor(26, 46, 58);
    doc.text(riskConfig.description, marginX + 20, cursorY + 70);
    cursorY += 105;

    addSectionTitle('Empfehlungen');
    addNumberedList(result.recommendations);

    if (result.legalReferences && result.legalReferences.length > 0) {
      addSectionTitle('Rechtliche Verweise');
      result.legalReferences.forEach((ref) => {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        doc.setTextColor(26, 46, 58);
        addParagraph(`${ref.text} – ${ref.law}`);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        doc.setTextColor(81, 120, 145);
        const linkLines = doc.splitTextToSize(ref.url, contentWidth);
        writeLines(linkLines, 10);
        cursorY += 6;
      });
    }

    addSectionTitle('Vollständige Analyse');
    addMultilineBlock(result.analysis);

    const previewText = text.trim();
    if (previewText) {
      addSectionTitle('Ausgangstext (Auszug)');
      const preview = previewText.length > 1200 ? `${previewText.slice(0, 1200)}…` : previewText;
      addMultilineBlock(preview);
    }

    doc.save('datenschutz-analyse.pdf');
  };

  return (
    <div className="app">
      <div className="container">
        <div className="header-controls">
          <button
            className="logout-button"
            onClick={handleLogout}
            aria-label="Abmelden"
            title="Abmelden"
          >
            <LogoutIcon />
            <span>Abmelden</span>
          </button>
          <button
            className="dark-mode-toggle"
            onClick={() => setDarkMode(!darkMode)}
            aria-label="Toggle dark mode"
          >
            {darkMode ? <SunIcon /> : <MoonIcon />}
          </button>
        </div>

        <header>
          <div className="header-icon">
            <SwissLegalIcon />
          </div>
          <h1>Swiss Legal Assessment</h1>
          <p>Datenschutz-Folgenabschätzung basierend auf Schweizer Recht</p>
        </header>

        <div className="input-section">
          <div className="model-select-wrapper">
            <label htmlFor="model-select" className="model-label">
              Modell wählen
            </label>
            <select
              id="model-select"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="model-select"
            >
              {availableModels.map((modelOption) => {
                // Format model name for display
                const displayName = modelOption.includes('/') 
                  ? modelOption.split('/').map(part => part.trim()).join(' / ')
                  : modelOption;
                return (
                  <option key={modelOption} value={modelOption}>
                    {displayName}
                  </option>
                );
              })}
            </select>
          </div>
          <div className="textarea-wrapper">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Geben Sie hier den Text ein, der im Hinblick auf Schweizer Recht analysiert werden soll..."
              rows={8}
              disabled={!password}
              readOnly={loading}
            />
          </div>
          <button
            onClick={handleAnalyze}
            disabled={loading || !text.trim() || !password}
            className={`analyze-button ${loading ? 'loading' : ''}`}
          >
            {loading ? (
              <>
                <span className="button-spinner"></span>
                <span>Analysiere...</span>
              </>
            ) : (
              <>
                <SearchIcon />
                <span>Analysieren</span>
              </>
            )}
          </button>
        </div>

        {error && (
          <div className="error-message animate-slide-in">
            <div className="error-icon">
              <AlertIcon />
            </div>
            <div>
              <strong>Fehler:</strong> {error}
            </div>
          </div>
        )}

        {result && (
          <div className="results animate-fade-in">
            <div className="result-section scroll-animate">
              <div className="section-header">
                <div className="section-icon">
                  <ClipboardIcon />
                </div>
                <h2>Zusammenfassung</h2>
              </div>
              <p className="summary-text">
                <TextWithCitations text={result.summary} references={result.legalReferences || []} />
              </p>
            </div>

            {/* DSFA Structure Sections - shown if available */}
            {result.description && (
              <div className="result-section scroll-animate">
                <div className="section-header">
                  <div className="section-icon">
                    <FileIcon />
                  </div>
                  <h2>Beschreibung der geplanten Bearbeitung</h2>
                </div>
                <div className="summary-text">
                  <TextWithCitations text={result.description} references={result.legalReferences || []} />
                </div>
              </div>
            )}

            {result.bruttorisiken && (
              <div className="result-section scroll-animate">
                <div className="section-header">
                  <div className="section-icon">
                    <WarningIcon />
                  </div>
                  <h2>Potentiell hohe Bruttorisiken</h2>
                </div>
                <div className="summary-text">
                  <TextWithCitations text={result.bruttorisiken} references={result.legalReferences || []} />
                </div>
              </div>
            )}

            {result.massnahmen && (
              <div className="result-section scroll-animate">
                <div className="section-header">
                  <div className="section-icon">
                    <ShieldIcon />
                  </div>
                  <h2>Geplante Massnahmen zur Senkung der Bruttorisiken</h2>
                </div>
                <div className="summary-text">
                  <TextWithCitations text={result.massnahmen} references={result.legalReferences || []} />
                </div>
              </div>
            )}

            {result.nettorisiken && (
              <div className="result-section scroll-animate">
                <div className="section-header">
                  <div className="section-icon">
                    <AlertIcon />
                  </div>
                  <h2>Verbleibende Nettorisiken</h2>
                </div>
                <div className="summary-text">
                  <TextWithCitations text={result.nettorisiken} references={result.legalReferences || []} />
                </div>
              </div>
            )}

            {result.ergebnis && (
              <div className="result-section scroll-animate">
                <div className="section-header">
                  <div className="section-icon">
                    <CheckIcon />
                  </div>
                  <h2>Ergebnis</h2>
                </div>
                <div className="summary-text">
                  <TextWithCitations text={result.ergebnis} references={result.legalReferences || []} />
                </div>
              </div>
            )}

            <div className="result-section scroll-animate">
              <div className="section-header">
                <div className="section-icon">
                  <ShieldIcon />
                </div>
                <h2>Risikobewertung</h2>
              </div>
              <RiskLevelIndicator riskLevel={result.riskLevel} />
            </div>

            <div className="result-section scroll-animate">
              <div className="section-header">
                <div className="section-icon">
                  <LightbulbIcon />
                </div>
                <h2>Empfehlungen</h2>
              </div>
              <ul className="recommendations-list">
                {result.recommendations.map((rec, index) => (
                  <li key={index} className="recommendation-item scroll-animate" style={{ animationDelay: `${index * 0.1}s` }}>
                    <span className="recommendation-number">{index + 1}</span>
                    <span className="recommendation-text">
                      <TextWithCitations text={rec} references={result.legalReferences || []} />
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            {result.legalReferences && result.legalReferences.length > 0 && (
              <div className="result-section scroll-animate">
                <div className="section-header">
                  <div className="section-icon">
                    <FileIcon />
                  </div>
                  <h2>Rechtliche Verweise</h2>
                </div>
                <div className="legal-references">
                  <p className="legal-references-intro">
                    Die folgenden Rechtsquellen wurden in der Analyse zitiert:
                  </p>
                  <ul className="legal-references-list">
                    {result.legalReferences.map((ref, index) => (
                      <li key={index} className="legal-reference-item scroll-animate" style={{ animationDelay: `${index * 0.05}s` }}>
                        <a
                          href={ref.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="legal-reference-link"
                        >
                          <span className="legal-reference-text">{ref.text}</span>
                          <ExternalLinkIcon />
                        </a>
                        <span className="legal-reference-law">{ref.law}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            <details className="result-section scroll-animate">
              <summary className="details-summary">
                <div className="details-summary-left">
                  <FileIcon />
                  <span>Vollständige Analyse</span>
                </div>
                <button
                  className="download-button inline"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleDownloadPdf();
                  }}
                >
                  <FileIcon />
                  <span>PDF herunterladen</span>
                </button>
              </summary>
              <pre className="full-analysis">{result.analysis}</pre>
            </details>
          </div>
        )}
      </div>
    </div>
  );
}

function RiskLevelIndicator({ riskLevel }: { riskLevel: string }) {
  const config = (() => {
    switch (riskLevel) {
      case 'LOW':
        return {
          color: '#57B9FF',
          bgColor: '#E8F4FD',
          icon: <CheckIcon />,
          label: 'Niedrig',
          percentage: 25,
          description: 'Geringes Risiko',
        };
      case 'MEDIUM':
        return {
          color: '#77B1D4',
          bgColor: '#D0E8F5',
          icon: <WarningIcon />,
          label: 'Mittel',
          percentage: 60,
          description: 'Moderates Risiko',
        };
      case 'HIGH':
        return {
          color: '#ef4444',
          bgColor: '#fee2e2',
          icon: <WarningIcon />,
          label: 'Hoch',
          percentage: 90,
          description: 'Hohes Risiko',
        };
      default:
        return {
          color: '#77B1D4',
          bgColor: '#E8F4FD',
          icon: <AlertIcon />,
          label: 'Unbekannt',
          percentage: 50,
          description: 'Unbekanntes Risiko',
        };
    }
  })();

  const [animatedPercentage, setAnimatedPercentage] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => {
      setAnimatedPercentage(config.percentage);
    }, 100);
    return () => clearTimeout(timer);
  }, [config.percentage]);

  const riskClass = riskLevel.toLowerCase() === 'high' ? 'high-risk' : 
                   riskLevel.toLowerCase() === 'medium' ? 'medium-risk' : 'low-risk';

  return (
    <div className="risk-indicator-container">
      <div className="risk-gauge-wrapper">
        <div className={`gauge-container ${riskClass}`} style={{ '--risk-color': config.color } as React.CSSProperties}>
          <svg className="risk-gauge" viewBox="0 0 200 200">
            <circle
              className="gauge-background"
              cx="100"
              cy="100"
              r="80"
              fill="none"
              stroke="currentColor"
              strokeWidth="16"
            />
            <circle
              className="gauge-fill"
              cx="100"
              cy="100"
              r="80"
              fill="none"
              stroke={config.color}
              strokeWidth="16"
              strokeLinecap="round"
              strokeDasharray={`${2 * Math.PI * 80}`}
              strokeDashoffset={`${2 * Math.PI * 80 * (1 - animatedPercentage / 100)}`}
              transform="rotate(-90 100 100)"
              style={{
                transition: 'stroke-dashoffset 1.5s cubic-bezier(0.4, 0, 0.2, 1)',
              }}
            />
          </svg>
          <div className={`gauge-icon-wrapper ${riskClass}`} style={{ color: config.color }}>
            {config.icon}
          </div>
        </div>
        <div className="risk-label-container">
          <div className="risk-label-main" style={{ color: config.color }}>
            {config.label}
          </div>
          <div className="risk-label-sub">{config.description}</div>
        </div>
      </div>
      <div className="risk-badge-modern" style={{ backgroundColor: config.bgColor, color: config.color }}>
        <span className="risk-badge-icon">
          {config.icon}
        </span>
        <span className="risk-badge-text">{riskLevel}</span>
      </div>
    </div>
  );
}

export default Dashboard;
