# Docker Setup Instructions

This document explains how to build and run the Ollama Assessment App using Docker.

## Prerequisites

Before building and running the Docker container, ensure you have:

1. **Docker installed** on your system
2. **Ollama installed** and running on your host machine
3. **Model pulled**: The `qwen3:4b` model must be available in Ollama

### Installing Ollama

If you don't have Ollama installed:

- **macOS/Linux**: Visit https://ollama.ai and follow installation instructions
- **Windows**: Download from https://ollama.ai/download

### Pulling the Model

Before running the container, pull the required model:

```bash
ollama pull qwen3:4b
```

Verify the model is available:

```bash
ollama list
```

You should see `qwen3:4b` in the list.

## Building the Docker Image

Build the Docker image using the Makefile:

```bash
make docker-build
```

Or manually:

```bash
docker build -t ollama-assessment-app .
```

This will:
1. Build the React frontend
2. Build the TypeScript backend
3. Create a production-ready image with both

## Running the Docker Container

### Option 1: Using Host Networking (Recommended)

This allows the container to access Ollama running on `localhost:11434`:

```bash
make docker-run
```

Or manually:

```bash
docker run --rm -p 3001:3001 --network=host -e OLLAMA_HOST=http://localhost:11434 ollama-assessment-app
```

**Note**: `--network=host` works on Linux. On macOS/Windows, Docker Desktop may not support host networking. Use Option 2 instead.

### Option 2: Using Environment Variable for Host IP

If host networking is not available (macOS/Windows), you need to:

1. Find your host machine's IP address:
   - **macOS/Linux**: `ip addr show` or `ifconfig`
   - **Windows**: `ipconfig`
   - Or use `host.docker.internal` (works on Docker Desktop)

2. Run the container with the host IP:

```bash
docker run --rm -p 3001:3001 -e OLLAMA_HOST=http://host.docker.internal:11434 ollama-assessment-app
```

For Linux, you might need to use your actual host IP:

```bash
docker run --rm -p 3001:3001 -e OLLAMA_HOST=http://172.17.0.1:11434 ollama-assessment-app
```

### Option 3: Running Ollama in Docker

If you prefer to run Ollama in Docker as well:

1. Run Ollama in a container:
```bash
docker run -d -p 11434:11434 --name ollama ollama/ollama
```

2. Pull the model inside the Ollama container:
```bash
docker exec -it ollama ollama pull qwen3:4b
```

3. Run the assessment app connected to the Ollama container:
```bash
docker run --rm -p 3001:3001 --link ollama:ollama -e OLLAMA_HOST=http://ollama:11434 ollama-assessment-app
```

## Accessing the Application

Once the container is running, access the application at:

- **Development (without Docker)**: http://localhost:5173
- **Production (Docker)**: http://localhost:3001

## Troubleshooting

### Cannot connect to Ollama

If you see connection errors:

1. Verify Ollama is running:
   ```bash
   curl http://localhost:11434/api/tags
   ```

2. Check the `OLLAMA_HOST` environment variable matches your Ollama instance

3. On macOS/Windows, ensure you're using `host.docker.internal` or the correct host IP

### Model not found

Ensure the model is pulled:
```bash
ollama pull qwen3:4b
```

### Port already in use

If port 3001 is already in use, change it:
```bash
docker run --rm -p 3002:3001 -e PORT=3001 ollama-assessment-app
```

Then access at http://localhost:3002

## Stopping the Container

Press `Ctrl+C` to stop the container, or if running in detached mode:

```bash
docker ps
docker stop <container-id>
```

