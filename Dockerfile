# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies for native modules (sharp needs vips)
RUN apk add --no-cache python3 make g++ vips-dev

# Copy package files
COPY package*.json ./

# Install all dependencies (using npm install to handle lock file updates)
RUN npm install --ignore-engines

# Copy source
COPY . .

# Build the app
RUN npm run build

# Production stage
FROM node:20-alpine AS runtime

WORKDIR /app

# Install runtime dependencies for native modules (sharp needs vips runtime)
RUN apk add --no-cache python3 make g++ vips

# Copy built app and package files
COPY --from=builder /app/build ./build
COPY --from=builder /app/package*.json ./

# Install production dependencies only
RUN npm install --omit=dev --ignore-engines && \
    apk del python3 make g++

# Create data directory
RUN mkdir -p /app/data/uploads

# Set environment
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/auth/check || exit 1

# Run the app
CMD ["node", "build"]
