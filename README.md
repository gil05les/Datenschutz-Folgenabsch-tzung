# Swiss Legal Assessment Application

A full-stack TypeScript/React application that integrates with OpenRouter (Grok) to provide structured Swiss legal text assessments with risk analysis and recommendations.

## Features

- Clean, modern React frontend with Vite
- Express backend with TypeScript
- Integration with OpenRouter API (x-ai/grok-4.1-fast model)
- Complete Swiss Data Protection Act (DSG) context included in every analysis
- Structured assessment output:
  - 2-3 sentence summary with legal citations
  - Risk level (LOW/MEDIUM/HIGH) with color coding
  - 3-5 improvement recommendations with specific legal citations
  - Clickable legal references with links to fedlex.admin.ch
- PDF export functionality
- Ready for Vercel deployment

## Prerequisites

- **Node.js** (v18 or higher)
- **npm** or **yarn**
- **OpenRouter API Key** (get one at https://openrouter.ai)

## Quick Start

1. **Set up environment variables:**

```bash
# Copy the example environment file
cp example.env .env

# Edit .env and set:
# - APP_PASSWORD=your-secure-password
# - OPENROUTER_API_KEY=sk-or-v1-your-key-here
```

2. **Install dependencies:**

```bash
make install
```

3. **Start development servers:**

```bash
make dev
```

This will start:
- Backend server on http://localhost:3001
- Frontend client on http://localhost:5173

4. **Open your browser:**

Visit http://localhost:5173 to use the application.

**Note:** You will be prompted to enter the password (set in `APP_PASSWORD`) when first using the application. The password is stored in your browser's localStorage for convenience.

## Available Make Commands

- `make install` - Install dependencies for both server and client
- `make dev` - Run both frontend and backend concurrently
- `make server` - Run backend only (port 3001)
- `make client` - Run frontend only (port 5173)
- `make build` - Build both server and client for production
- `make format` - Format code (if prettier is configured)

## Manual Setup

If you prefer not to use the Makefile:

### Backend

```bash
cd server
npm install
npm run dev
```

### Frontend

```bash
cd client
npm install
npm run dev
```

## Project Structure

```
/
├── Makefile              # Build and run commands
├── README.md             # This file
├── VERCEL_DEPLOYMENT.md  # Vercel deployment guide
├── example.env           # Environment variables template
├── example_prompts.txt   # Example prompts for testing
├── dsg.xml               # Swiss Data Protection Act (cleaned XML)
├── server/               # Backend (Express + TypeScript)
│   ├── src/
│   │   └── index.ts      # Main server file
│   ├── package.json
│   └── tsconfig.json
└── client/               # Frontend (React + Vite)
    ├── src/
    │   ├── App.tsx       # Main React component
    │   ├── App.css       # Styles
    │   └── main.tsx      # Entry point
    ├── package.json
    ├── vite.config.ts
    └── index.html
```

## API Endpoint

### POST `/api/analyze`

Analyzes text from a Swiss legal perspective and returns structured assessment.

**Request:**
```json
{
  "text": "Your text to analyze here...",
  "model": "x-ai/grok-4.1-fast:free",
  "password": "your-password"
}
```

**Headers:**
```
X-App-Password: your-password
```

**Response:**
```json
{
  "summary": "2-3 sentence summary with legal citations...",
  "riskLevel": "LOW | MEDIUM | HIGH",
  "analysis": "Full model output...",
  "recommendations": [
    "Recommendation 1 with citation (Art. 5 DSG)",
    "Recommendation 2 with citation",
    ...
  ],
  "legalReferences": [
    {
      "law": "DSG",
      "article": "5",
      "text": "Art. 5 DSG",
      "url": "https://www.fedlex.admin.ch/eli/cc/2022/491/de#art_5"
    }
  ]
}
```

## Environment Variables

Create a `.env` file in the project root (copy from `example.env`):

- `APP_PASSWORD` - Password to protect API endpoints (default: `mypassword`)
- `PORT` - Server port (default: 3001)
- `OPENROUTER_API_KEY` - Your OpenRouter API key (required)
- `OPENROUTER_MODEL` - Model to use (default: `x-ai/grok-4.1-fast:free`)
- `OPENROUTER_BASE_URL` - OpenRouter API URL (default: `https://openrouter.ai/api/v1`)
- `OPENROUTER_APP_URL` - Your app URL for OpenRouter referrer (for production, set to your Vercel URL)
- `NODE_ENV` - Environment mode (development/production)

**Security Note:** The `.env` file is gitignored. Never commit your actual API keys or passwords to version control.

## Deployment

### Vercel (Recommended)

See [VERCEL_DEPLOYMENT.md](./VERCEL_DEPLOYMENT.md) for detailed deployment instructions.

Quick summary:
1. Push code to GitHub
2. Import project on Vercel
3. Set environment variables
4. Deploy!

## Troubleshooting

### API Key Error

If you see "OPENROUTER_API_KEY fehlt":
1. Check that `.env` file exists in project root
2. Verify `OPENROUTER_API_KEY` is set correctly
3. Restart the server after changing `.env`

### Port conflicts

If ports 3001 or 5173 are in use, you can:

- Change backend port: Set `PORT` environment variable
- Change frontend port: Edit `client/vite.config.ts`

### Build errors

Ensure you have the correct Node.js version (v18+):

```bash
node --version
```

### OpenRouter API Errors

1. Verify your API key is valid at https://openrouter.ai
2. Check that you have credits/quota available
3. Verify the model name is correct (e.g., `x-ai/grok-4.1-fast:free`)

## License

ISC
