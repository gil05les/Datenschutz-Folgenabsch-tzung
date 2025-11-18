# Multi-stage build for Ollama Assessment App

# Stage 1: Build client
FROM node:20-alpine AS client-builder
WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

# Stage 2: Build server
FROM node:20-alpine AS server-builder
WORKDIR /app/server
COPY server/package*.json ./
RUN npm ci
COPY server/ ./
RUN npm run build

# Stage 3: Production image
FROM node:20-alpine
WORKDIR /app

# Copy server dependencies and built files
COPY server/package*.json ./
RUN npm ci --only=production

# Copy built server code
COPY --from=server-builder /app/server/dist ./dist

# Copy built client files
COPY --from=client-builder /app/client/dist ./client-dist

# Expose port
EXPOSE 3001

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3001
ENV OLLAMA_HOST=http://localhost:11434

# Start server
CMD ["node", "dist/index.js"]

