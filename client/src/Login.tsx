import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './App.css';

// Swiss Legal Logo
const SwissLegalIcon = () => (
  <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"></path>
    <path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"></path>
    <path d="M7 21h10"></path>
    <path d="M12 3v18"></path>
    <path d="M3 7h2c2 0 5 1 7 3 2-2 5-3 7-3h2"></path>
  </svg>
);

// Lock Icon
const LockIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
    <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
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

function Login() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem('darkMode');
    return saved ? JSON.parse(saved) : false;
  });
  const navigate = useNavigate();

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('darkMode', JSON.stringify(darkMode));
  }, [darkMode]);

  // Check if already authenticated
  useEffect(() => {
    const savedPassword = localStorage.getItem('appPassword');
    if (savedPassword) {
      // Verify password is still valid
      verifyPassword(savedPassword);
    }
  }, []);

  const verifyPassword = async (passwordToVerify: string) => {
    try {
      const response = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-App-Password': passwordToVerify,
        },
        body: JSON.stringify({ password: passwordToVerify }),
      });
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          navigate('/dashboard');
          return;
        }
      }
      // Password invalid, stay on login page
      localStorage.removeItem('appPassword');
    } catch (err) {
      // Password invalid, stay on login page
      localStorage.removeItem('appPassword');
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    if (!password.trim()) {
      setError('Bitte geben Sie ein Passwort ein');
      setLoading(false);
      return;
    }

    try {
      // Verify password using dedicated auth endpoint
      const response = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-App-Password': password.trim(),
        },
        body: JSON.stringify({ password: password.trim() }),
      });

      if (response.ok) {
        // Password is correct
        const data = await response.json();
        if (data.success) {
          localStorage.setItem('appPassword', password.trim());
          navigate('/dashboard');
          return;
        }
      }

      // Password is incorrect - show error message
      let errorMessage = 'Ungültiges Passwort. Bitte versuchen Sie es erneut.';
      
      if (response.status === 401) {
        try {
          const errorData = await response.json();
          if (errorData.error) {
            errorMessage = errorData.error;
          }
        } catch {
          // If JSON parsing fails, use default message
          errorMessage = 'Ungültiges Passwort. Bitte versuchen Sie es erneut.';
        }
      } else {
        errorMessage = 'Verbindungsfehler. Bitte versuchen Sie es später erneut.';
      }
      
      setError(errorMessage);
      setPassword('');
    } catch (err: any) {
      setError('Verbindungsfehler. Bitte versuchen Sie es später erneut.');
      console.error('Login error:', err);
      setPassword('');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app login-page">
      <div className="login-container">
        <button
          className="dark-mode-toggle"
          onClick={() => setDarkMode(!darkMode)}
          aria-label="Toggle dark mode"
        >
          {darkMode ? <SunIcon /> : <MoonIcon />}
        </button>

        <div className="login-box">
          <div className="login-header">
            <div className="login-icon-wrapper">
              <SwissLegalIcon />
            </div>
            <h1>Swiss Legal Assessment</h1>
            <p>Datenschutz-Folgenabschätzung</p>
          </div>

          <form onSubmit={handleLogin} className="login-form">
            <div className="login-input-group">
              <label htmlFor="login-password" className="login-label">
                <LockIcon />
                <span>Passwort</span>
              </label>
              <input
                id="login-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Passwort eingeben..."
                className="login-input"
                disabled={loading}
                autoFocus
              />
            </div>

            {error && (
              <div className="login-error">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !password.trim()}
              className={`login-button ${loading ? 'loading' : ''}`}
            >
              {loading ? (
                <>
                  <span className="button-spinner"></span>
                  <span>Anmelden...</span>
                </>
              ) : (
                <>
                  <span>Anmelden</span>
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default Login;

