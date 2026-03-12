#!/bin/bash
# Donki Chat Deployment Script
# Run on Lincstation: bash /mnt/user/appdata/donki-chat/deploy.sh

set -e

DEPLOY_DIR="/mnt/user/appdata/donki-chat"

echo "🐧 Donki Chat Deployment"
echo "========================"

cd "$DEPLOY_DIR"

# Pull latest code
echo "📥 Pulling latest code..."
git pull origin main

# Install dependencies (if package.json changed)
echo "📦 Installing dependencies..."
npm install --frozen-lockfile

# Build
echo "🔨 Building..."
npm run build

# Rebuild Docker container
echo "🐋 Rebuilding Docker container..."
docker build -t donki-chat:latest .

# Stop old container
echo "⏸️  Stopping old container..."
docker stop donki-chat || true
docker rm donki-chat || true

# Start new container
echo "🚀 Starting new container..."
docker run -d \
  --name donki-chat \
  -p 3002:3000 \
  -v /mnt/user/appdata/donki-chat/data:/app/data \
  --restart unless-stopped \
  donki-chat:latest

echo ""
echo "✅ Deployment complete!"
echo "   https://chat.opendonki.de"
echo ""
echo "🔍 Check logs:"
echo "   docker logs -f donki-chat"
