# Docker Setup Instructions

**Note:** This Docker setup is optional. For production deployment, we strongly recommend using **Vercel** (see [VERCEL_DEPLOYMENT.md](./VERCEL_DEPLOYMENT.md)). This Docker setup is mainly for local testing/development in a containerized environment.

This document explains how to build and run the Swiss Legal Assessment App using Docker.

## Prerequisites

Before building and running the Docker container, ensure you have:

1. **Docker installed** on your system
2. **OpenRouter API Key** (get one at https://openrouter.ai)

## Building the Docker Image

Build the Docker image using the Makefile:

```bash
make docker-build
```

Or manually:

```bash
docker build -t swiss-legal-assessment-app .
```

This will:
1. Build the React frontend
2. Build the TypeScript backend
3. Create a production-ready image with both

## Running the Docker Container

Run the container with required environment variables:

```bash
docker run --rm -p 3001:3001 \
  -e OPENROUTER_API_KEY=sk-or-v1-your-key-here \
  -e APP_PASSWORD=your-password \
  -e OPENROUTER_MODEL=x-ai/grok-4.1-fast:free \
  swiss-legal-assessment-app
```

### Using Environment Variables File

For convenience, you can use a `.env` file:

```bash
docker run --rm -p 3001:3001 \
  --env-file .env \
  swiss-legal-assessment-app
```

Make sure your `.env` file contains:
- `OPENROUTER_API_KEY`
- `APP_PASSWORD`
- `OPENROUTER_MODEL` (optional, defaults to `x-ai/grok-4.1-fast:free`)
- `OPENROUTER_BASE_URL` (optional, defaults to `https://openrouter.ai/api/v1`)

## Accessing the Application

Once the container is running, access the application at:

- **Production (Docker)**: http://localhost:3001
- **Development (without Docker)**: http://localhost:5173 (frontend) and http://localhost:3001 (backend)

## Troubleshooting

### OpenRouter API Key Error

If you see "OPENROUTER_API_KEY fehlt":

1. Verify the environment variable is set correctly:
   ```bash
   docker run --rm -e OPENROUTER_API_KEY=your-key swiss-legal-assessment-app env | grep OPENROUTER
   ```

2. Check that the API key is valid at https://openrouter.ai

### Port already in use

If port 3001 is already in use, map to a different port:

```bash
docker run --rm -p 3002:3001 \
  -e OPENROUTER_API_KEY=sk-or-v1-your-key-here \
  -e APP_PASSWORD=your-password \
  swiss-legal-assessment-app
```

Then access at http://localhost:3002

### Build errors

If the build fails:

1. Ensure you have enough disk space
2. Check Docker logs: `docker build --no-cache -t swiss-legal-assessment-app .`
3. Verify Node.js version in Dockerfile (currently 20-alpine)

## Stopping the Container

Press `Ctrl+C` to stop the container, or if running in detached mode (`-d` flag):

```bash
docker ps
docker stop <container-id>
```

## Production Deployment

For production, use **Vercel** instead of Docker. See [VERCEL_DEPLOYMENT.md](./VERCEL_DEPLOYMENT.md) for instructions.

Vercel offers:
- ✅ Automatic deployments from GitHub
- ✅ Free tier with generous limits
- ✅ Built-in HTTPS
- ✅ Serverless functions (no container management)
- ✅ Better performance and scalability
