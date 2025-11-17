# Ollama LLM Assessment Application

A full-stack TypeScript/React application that integrates with local Ollama LLM to provide structured text assessments with risk analysis and recommendations.

## Features

- Clean, modern React frontend with Vite
- Express backend with TypeScript
- Integration with local Ollama LLM (qwen3:4b model)
- Structured assessment output:
  - 2-3 sentence summary
  - Risk level (LOW/MEDIUM/HIGH) with color coding
  - 3-5 improvement recommendations
- Docker support for production deployment
- Single-command development setup

## Prerequisites

- **Node.js** (v18 or higher)
- **npm** or **yarn**
- **Ollama** installed and running
- **qwen3:4b model** pulled in Ollama

### Installing Ollama

Visit https://ollama.ai and follow the installation instructions for your platform.

### Pulling the Model

```bash
ollama pull qwen3:4b
```

Verify the model is available:

```bash
ollama list
```

## Quick Start (Without Docker)

1. **Set up environment variables:**

```bash
# Copy the example environment file
cp example.env .env

# Edit .env and set your password (default is "mypassword")
# APP_PASSWORD=your-secure-password
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

**Note:** You will be prompted to enter the password (default: `mypassword`) when first using the application. The password is stored in your browser's localStorage for convenience.

## Available Make Commands

- `make install` - Install dependencies for both server and client
- `make dev` - Run both frontend and backend concurrently
- `make server` - Run backend only (port 3001)
- `make client` - Run frontend only (port 5173)
- `make build` - Build both server and client for production
- `make format` - Format code (if prettier is configured)
- `make docker-build` - Build Docker image
- `make docker-run` - Run Docker container

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

## Docker Setup

See [docker-init.md](./docker-init.md) for detailed Docker instructions.

Quick Docker commands:

```bash
# Build image
make docker-build

# Run container
make docker-run
```

Then access at http://localhost:3001

## Project Structure

```
/
├── Makefile              # Build and run commands
├── Dockerfile            # Docker multi-stage build
├── docker-init.md        # Docker setup instructions
├── README.md             # This file
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

Analyzes text and returns structured assessment.

**Request:**
```json
{
  "text": "Your text to analyze here..."
}
```

**Response:**
```json
{
  "summary": "2-3 sentence summary...",
  "riskLevel": "LOW | MEDIUM | HIGH",
  "analysis": "Full model output...",
  "recommendations": [
    "Recommendation 1",
    "Recommendation 2",
    ...
  ]
}
```

## Environment Variables

Create a `.env` file in the project root (copy from `example.env`):

- `APP_PASSWORD` - Password to protect API endpoints (default: `mypassword`)
- `PORT` - Server port (default: 3001)
- `OLLAMA_HOST` - Ollama API host (default: http://localhost:11434)
- `NODE_ENV` - Environment mode (development/production)

**Security Note:** The `.env` file is gitignored. Never commit your actual password to version control.

## Troubleshooting

### Cannot connect to Ollama

1. Ensure Ollama is running:
   ```bash
   curl http://localhost:11434/api/tags
   ```

2. Verify the model is pulled:
   ```bash
   ollama list
   ```

3. Check `OLLAMA_HOST` environment variable if using custom configuration

### Port conflicts

If ports 3001 or 5173 are in use, you can:

- Change backend port: Set `PORT` environment variable
- Change frontend port: Edit `client/vite.config.ts`

### Build errors

Ensure you have the correct Node.js version (v18+):

```bash
node --version
```

## License

ISC
