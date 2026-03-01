#!/bin/bash
# Donki Chat Setup Script
# Run on Lincstation: bash /config/.openclaw/workspace/projects/donki-chat/scripts/setup.sh

set -e

INSTALL_DIR="/mnt/data/donki-chat"
SOURCE_DIR="/config/.openclaw/workspace/projects/donki-chat"

echo "🐧 Donki Chat Deployment"
echo "========================"

# Create and copy
mkdir -p "$INSTALL_DIR"
echo "📦 Copying project files..."
rsync -av --exclude=node_modules --exclude=.svelte-kit "$SOURCE_DIR/" "$INSTALL_DIR/"
cd "$INSTALL_DIR"

# Generate secrets
SESSION_SECRET=$(openssl rand -hex 32)

# Create .env with bcrypt hash generated at build time
cat > .env << 'EOF'
# Donki Chat - Auto-generated config
PASSWORD_HASH=$2b$12$rKxPqVvZqBvZqXqXqXqXqOqXqXqXqXqXqXqXqXqXqXqXqXqXqXqXq
SESSION_SECRET=REPLACE_ME
OPENCLAW_API_URL=http://host.docker.internal:8080
NODE_ENV=production
EOF

# Fix session secret
sed -i "s/REPLACE_ME/$SESSION_SECRET/" .env

# Create hash generator for first run
cat > generate-hash.js << 'HASHGEN'
const bcrypt = require('bcrypt');
const password = process.argv[2] || 'DonkiChat2026!';
bcrypt.hash(password, 12).then(hash => console.log(hash));
HASHGEN

# Create network
docker network create donki-network 2>/dev/null || true

# Build
echo "🔨 Building image..."
docker compose build --no-cache

# Generate real hash using built image
echo "🔐 Generating password hash..."
HASH=$(docker run --rm -v "$INSTALL_DIR/generate-hash.js:/app/gen.js" donki-chat node /app/gen.js 'DonkiChat2026!' 2>/dev/null)
if [ -n "$HASH" ]; then
    # Escape $ for sed
    ESCAPED_HASH=$(echo "$HASH" | sed 's/\$/\\$/g')
    sed -i "s|\$2b\$12\$rKxPqVvZqBvZqXqXqXqXqOqXqXqXqXqXqXqXqXqXqXqXqXqXqXqXq|$ESCAPED_HASH|" .env
    echo "✅ Password hash generated"
fi

# Start
echo "🚀 Starting..."
docker compose up -d

echo ""
echo "✅ Donki Chat läuft!"
echo "   http://192.168.0.155:3000"
echo "   Login: DonkiChat2026!"
echo ""
echo "📋 Jetzt noch Caddy config hinzufügen:"
echo "   chat.opendonki.de -> localhost:3000"
