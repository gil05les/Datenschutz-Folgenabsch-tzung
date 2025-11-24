.PHONY: install dev server client build docker-build docker-run format

# Install dependencies for both server and client
install:
	@echo "Installing server dependencies..."
	cd server && npm install
	@echo "Installing client dependencies..."
	cd client && npm install
	@echo "Installation complete!"

# Run both server and client in development mode
dev:
	@echo "Starting development servers..."
	npx concurrently "make server" "make client"

# Run backend server only
server:
	@echo "Starting backend server..."
	cd server && npm run dev

# Run frontend client only
client:
	@echo "Starting frontend client..."
	cd client && npm run dev

# Build both server and client
build:
	@echo "Building server..."
	cd server && npm run build
	@echo "Building client..."
	cd client && npm run build
	@echo "Copying client build to server..."
	cp -r client/dist server/client-dist
	@echo "Build complete!"

# Format code (using prettier if available, otherwise just echo)
format:
	@echo "Formatting code..."
	@if command -v npx > /dev/null; then \
		npx prettier --write "server/src/**/*.{ts,tsx}" "client/src/**/*.{ts,tsx}" 2>/dev/null || echo "Prettier not configured, skipping formatting"; \
	else \
		echo "npx not available, skipping formatting"; \
	fi

# Note: Docker support removed - use Vercel for deployment instead
# See VERCEL_DEPLOYMENT.md for deployment instructions

