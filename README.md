# 🐴 Donki Chat

Minimalistisches, selbst-gehostetes Chat-Interface für Claude/OpenClaw.

## Features

- 💬 Chat mit Markdown-Rendering und Syntax-Highlighting
- 🖼️ Bild-Upload (inline im Chat)
- 🔐 Einfache Passwort-Auth (Single-User)
- 📱 Mobile-friendly, Dark Mode Default
- 🚀 SSE Streaming für Live-Responses

## Tech Stack

- **Frontend:** SvelteKit + Tailwind CSS
- **Backend:** SvelteKit API Routes
- **Database:** SQLite (better-sqlite3)
- **Markdown:** marked + highlight.js

## Quick Start

### 1. Environment Setup

```bash
cp .env.example .env
```

Generiere einen Password-Hash:
```bash
npx bcrypt-cli hash "dein-sicheres-passwort"
```

Generiere ein Session-Secret:
```bash
openssl rand -hex 32
```

Trage die Werte in `.env` ein.

### 2. Development

```bash
npm install
npm run dev
```

### 3. Production (Docker)

```bash
# Docker Network erstellen (falls nicht vorhanden)
docker network create donki-network

# Starten
docker compose up -d
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PASSWORD_HASH` | ✅ | - | BCrypt-Hash des Passworts |
| `SESSION_SECRET` | ✅ | - | Random 32+ Zeichen |
| `OPENCLAW_API_URL` | ❌ | `http://host.docker.internal:8080` | OpenClaw API URL |
| `OPENCLAW_API_KEY` | ❌ | - | API Key (falls benötigt) |
| `CLAUDE_MODEL` | ❌ | `claude-sonnet-4-20250514` | Claude Model |
| `MAX_TOKENS` | ❌ | `4096` | Max Response Tokens |
| `MAX_FILE_SIZE` | ❌ | `10485760` | Max Upload Size (10MB) |

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/login` | Login mit Passwort |
| POST | `/api/auth/logout` | Session beenden |
| GET | `/api/auth/check` | Session prüfen |
| POST | `/api/chat` | Message senden (SSE Stream) |
| GET | `/api/chat/history` | Chat-History laden |
| DELETE | `/api/chat/history` | History löschen |
| POST | `/api/upload` | Bild hochladen |
| GET | `/api/upload/:id` | Bild abrufen |

## Project Structure

```
donki-chat/
├── src/
│   ├── lib/
│   │   ├── server/          # Server-side modules
│   │   │   ├── db.ts        # SQLite
│   │   │   ├── auth.ts      # Authentication
│   │   │   ├── claude.ts    # OpenClaw Client
│   │   │   └── upload.ts    # File Upload
│   │   ├── components/      # Svelte Components
│   │   └── stores/          # Svelte Stores
│   ├── routes/              # SvelteKit Routes
│   │   └── api/             # API Endpoints
│   └── app.css              # Tailwind Styles
├── data/                    # Persistent Data (mounted)
│   ├── chat.db              # SQLite Database
│   └── uploads/             # Uploaded Images
├── docker-compose.yml
├── Dockerfile
└── .env.example
```

## License

MIT
