# Donki Chat - Konzept & Architekturplan

> **Schlankes WebUI für Claude/OpenClaw Chat**  
> Erstellt: 2026-03-01

---

## 1. Executive Summary

Donki Chat ist ein minimalistisches, selbst-gehostetes Chat-Interface für die Kommunikation mit Claude über OpenClaw. Der Fokus liegt auf Einfachheit, Geschwindigkeit und einer cleanen UX ohne Feature-Bloat.

**Kernfeatures MVP:**
- 💬 Chat mit Markdown-Rendering
- 🖼️ Bild-Upload (inline im Chat)
- 🔐 Einfache Passwort-Auth (Single-User)
- 📱 Mobile-friendly, Dark Mode Default

---

## 2. Tech-Stack Empfehlung

### Frontend
| Komponente | Technologie | Begründung |
|------------|-------------|------------|
| Framework | **SvelteKit** | Leichtgewichtig, schnell, minimaler Bundle-Size |
| Styling | **Tailwind CSS** | Utility-first, Dark Mode out-of-box |
| Markdown | **marked** + **highlight.js** | Standard, bewährt |
| Icons | **Lucide Icons** | Minimal, tree-shakeable |

**Alternativen:** Vue 3 + Vite wäre auch gut, aber Svelte ist noch schlanker.

### Backend
| Komponente | Technologie | Begründung |
|------------|-------------|------------|
| Runtime | **Node.js 20+** | Bereits im Stack |
| Framework | **Hono** | Ultra-minimal, Web-Standard APIs |
| DB | **SQLite** (besser-sqlite3) | Zero-Config, single file |
| Auth | **Session Cookie** + bcrypt | Simpel, sicher genug für Single-User |

**Alternative:** Bun statt Node - noch schneller, aber Node ist stabiler.

### Infrastruktur
| Komponente | Technologie |
|------------|-------------|
| Container | Docker + Docker Compose |
| Reverse Proxy | Caddy (existiert bereits) |
| Host | Lincstation (192.168.0.155) |
| Domain | chat.opendonki.de |

---

## 3. Architektur-Übersicht

```
┌─────────────────────────────────────────────────────────────┐
│                    chat.opendonki.de                        │
│                         (Caddy)                             │
└─────────────────────────┬───────────────────────────────────┘
                          │ HTTPS
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                   Docker Container                          │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                  donki-chat                          │   │
│  │                                                      │   │
│  │  ┌──────────────┐      ┌──────────────────────┐    │   │
│  │  │   SvelteKit  │      │    Hono Backend      │    │   │
│  │  │   Frontend   │◄────►│    /api/*            │    │   │
│  │  │   :3000      │      │                      │    │   │
│  │  └──────────────┘      └──────────┬───────────┘    │   │
│  │                                    │                │   │
│  │                        ┌───────────▼───────────┐   │   │
│  │                        │   SQLite Database     │   │   │
│  │                        │   /data/chat.db       │   │   │
│  │                        └───────────────────────┘   │   │
│  └─────────────────────────────────────────────────────┘   │
│                              │                              │
└──────────────────────────────┼──────────────────────────────┘
                               │ HTTP
                               ▼
                    ┌─────────────────────┐
                    │   OpenClaw API      │
                    │   (Claude Backend)  │
                    └─────────────────────┘
```

### Datenfluss

1. User öffnet `chat.opendonki.de`
2. Caddy leitet zu Container Port 3000
3. SvelteKit rendert UI, prüft Session
4. User sendet Message → Backend API
5. Backend streamt an OpenClaw/Claude
6. Response wird live in UI gestreamt
7. Chat-History wird in SQLite gespeichert

---

## 4. Datei-/Ordnerstruktur

```
donki-chat/
├── docker-compose.yml
├── Dockerfile
├── package.json
├── .env.example
├── data/                    # Gemountet für Persistenz
│   ├── chat.db
│   └── uploads/
├── src/
│   ├── lib/
│   │   ├── server/
│   │   │   ├── db.ts       # SQLite Connection
│   │   │   ├── auth.ts     # Session Management
│   │   │   ├── claude.ts   # OpenClaw/Claude Client
│   │   │   └── upload.ts   # File Upload Handler
│   │   ├── components/
│   │   │   ├── ChatMessage.svelte
│   │   │   ├── ChatInput.svelte
│   │   │   ├── ImageUpload.svelte
│   │   │   └── MarkdownRenderer.svelte
│   │   └── stores/
│   │       └── chat.ts     # Chat State
│   ├── routes/
│   │   ├── +layout.svelte
│   │   ├── +page.svelte    # Main Chat UI
│   │   ├── login/
│   │   │   └── +page.svelte
│   │   └── api/
│   │       ├── auth/
│   │       │   ├── login/+server.ts
│   │       │   └── logout/+server.ts
│   │       ├── chat/
│   │       │   ├── +server.ts        # POST: Send message (SSE stream)
│   │       │   └── history/+server.ts # GET: Load history
│   │       └── upload/
│   │           └── +server.ts         # POST: Image upload
│   └── app.css             # Tailwind + Custom Styles
├── static/
│   └── favicon.svg
└── README.md
```

---

## 5. API-Endpoints

### Auth

| Method | Endpoint | Beschreibung |
|--------|----------|--------------|
| POST | `/api/auth/login` | Login mit Passwort |
| POST | `/api/auth/logout` | Session beenden |
| GET | `/api/auth/check` | Session prüfen |

### Chat

| Method | Endpoint | Beschreibung |
|--------|----------|--------------|
| POST | `/api/chat` | Message senden (SSE Stream Response) |
| GET | `/api/chat/history` | Chat-History laden |
| DELETE | `/api/chat/history` | History löschen |

### Upload

| Method | Endpoint | Beschreibung |
|--------|----------|--------------|
| POST | `/api/upload` | Bild hochladen |
| GET | `/api/upload/:id` | Bild abrufen |

### Request/Response Beispiele

**POST /api/chat**
```json
// Request
{
  "message": "Erkläre mir Docker",
  "images": ["upload-id-123"],  // Optional
  "conversationId": "conv-456"
}

// Response: Server-Sent Events (SSE)
data: {"type": "start", "messageId": "msg-789"}
data: {"type": "delta", "content": "Docker ist"}
data: {"type": "delta", "content": " eine Container-"}
data: {"type": "done", "usage": {"input": 12, "output": 234}}
```

---

## 6. Datenmodell

```sql
-- Conversations
CREATE TABLE conversations (
    id TEXT PRIMARY KEY,
    title TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Messages  
CREATE TABLE messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    role TEXT NOT NULL,  -- 'user' | 'assistant'
    content TEXT NOT NULL,
    images TEXT,  -- JSON array of upload IDs
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (conversation_id) REFERENCES conversations(id)
);

-- Uploads
CREATE TABLE uploads (
    id TEXT PRIMARY KEY,
    filename TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size INTEGER NOT NULL,
    path TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Sessions (für Auth)
CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    expires_at DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX idx_messages_conversation ON messages(conversation_id);
CREATE INDEX idx_sessions_expires ON sessions(expires_at);
```

---

## 7. Security-Konzept

### Authentifizierung

```
┌─────────────────────────────────────────────────┐
│                Login Flow                       │
├─────────────────────────────────────────────────┤
│  1. User gibt Passwort ein                      │
│  2. Backend vergleicht mit HASHED_PASSWORD env  │
│  3. Bei Match: Session-Cookie setzen            │
│  4. Cookie: HttpOnly, Secure, SameSite=Strict   │
│  5. Session-ID in SQLite speichern              │
│  6. Session läuft nach 7 Tagen ab               │
└─────────────────────────────────────────────────┘
```

### Environment Variables

```env
# .env
PASSWORD_HASH=<bcrypt hash>  # Generiert mit: npx bcrypt-cli hash "mein-passwort"
SESSION_SECRET=<random 32 chars>
OPENCLAW_API_URL=http://openclaw:8080
OPENCLAW_API_KEY=<optional>
```

### Security Headers

```typescript
// Via SvelteKit hooks.server.ts
export const handle: Handle = async ({ event, resolve }) => {
  const response = await resolve(event);
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  return response;
};
```

### Upload Security

- Max File Size: 10MB
- Allowed MIME Types: `image/jpeg`, `image/png`, `image/gif`, `image/webp`
- Filename Sanitization
- Virus-Scan: Optional (ClamAV)

---

## 8. Deployment-Setup

### docker-compose.yml

```yaml
version: '3.8'

services:
  donki-chat:
    build: .
    container_name: donki-chat
    restart: unless-stopped
    ports:
      - "3000:3000"
    volumes:
      - ./data:/app/data
    environment:
      - NODE_ENV=production
      - PASSWORD_HASH=${PASSWORD_HASH}
      - SESSION_SECRET=${SESSION_SECRET}
      - OPENCLAW_API_URL=${OPENCLAW_API_URL:-http://host.docker.internal:8080}
    networks:
      - donki-network

networks:
  donki-network:
    external: true
```

### Dockerfile

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine AS runtime
WORKDIR /app
COPY --from=builder /app/build ./build
COPY --from=builder /app/package*.json ./
RUN npm ci --omit=dev
EXPOSE 3000
CMD ["node", "build"]
```

### Caddy Config (Ergänzung)

```caddyfile
chat.opendonki.de {
    reverse_proxy localhost:3000
    encode gzip
    
    header {
        Strict-Transport-Security "max-age=31536000; includeSubDomains"
    }
}
```

---

## 9. UI/UX Design

### Wireframe

```
┌──────────────────────────────────────────────────────────┐
│  🐴 Donki Chat                           [New] [Clear]  │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  ┌────────────────────────────────────────────────────┐ │
│  │ 🧑 User                                     10:30  │ │
│  │ Erkläre mir Docker Compose                         │ │
│  └────────────────────────────────────────────────────┘ │
│                                                          │
│  ┌────────────────────────────────────────────────────┐ │
│  │ 🤖 Claude                                   10:31  │ │
│  │ Docker Compose ist ein Tool zum Definieren...      │ │
│  │                                                     │ │
│  │ ```yaml                                             │ │
│  │ version: '3.8'                                      │ │
│  │ services:                                           │ │
│  │   web:                                              │ │
│  │     image: nginx                                    │ │
│  │ ```                                                 │ │
│  └────────────────────────────────────────────────────┘ │
│                                                          │
├──────────────────────────────────────────────────────────┤
│  [📎] ┌──────────────────────────────────────┐ [Send]  │
│       │ Schreibe eine Nachricht...            │         │
│       └──────────────────────────────────────┘          │
└──────────────────────────────────────────────────────────┘
```

### Design Tokens

```css
:root {
  /* Dark Mode (Default) */
  --bg-primary: #0f0f0f;
  --bg-secondary: #1a1a1a;
  --bg-tertiary: #252525;
  --text-primary: #e5e5e5;
  --text-secondary: #a3a3a3;
  --accent: #6366f1;  /* Indigo */
  --accent-hover: #818cf8;
  --border: #2e2e2e;
  --radius: 8px;
}
```

---

## 10. Nächste Schritte / Roadmap

### Phase 1: Setup (1-2 Stunden)
- [x] Konzept erstellen
- [ ] Projekt initialisieren (SvelteKit + Tailwind)
- [ ] Docker Setup
- [ ] Basic File Structure

### Phase 2: Backend MVP (2-3 Stunden)
- [ ] SQLite Setup mit Schema
- [ ] Auth Middleware (Passwort + Session)
- [ ] OpenClaw/Claude Client Integration
- [ ] Chat API mit SSE Streaming
- [ ] Upload API

### Phase 3: Frontend MVP (3-4 Stunden)
- [ ] Login Page
- [ ] Chat UI Component
- [ ] Markdown Rendering
- [ ] Image Upload Component
- [ ] SSE Stream Handler
- [ ] Mobile Responsive

### Phase 4: Polish (1-2 Stunden)
- [ ] Loading States
- [ ] Error Handling
- [ ] Keyboard Shortcuts (Cmd+Enter to send)
- [ ] Copy Code Button
- [ ] Clear History

### Phase 5: Deployment (30 Min)
- [ ] Caddy Config erweitern
- [ ] Docker Compose auf Lincstation
- [ ] Test E2E
- [ ] Done! 🎉

---

## 11. Bonus: Spätere Features (Post-MVP)

| Feature | Aufwand | Priorität |
|---------|---------|-----------|
| Conversation Sidebar | Mittel | Hoch |
| Export Chat als MD | Gering | Mittel |
| System Prompt Config | Gering | Mittel |
| Voice Input (Whisper) | Hoch | Niedrig |
| Multi-Model Support | Mittel | Niedrig |
| Themes/Light Mode | Gering | Niedrig |

---

## 12. Offene Fragen

1. **OpenClaw API:** Wie genau ist das Interface? REST? WebSocket?
2. **Image Handling:** Werden Bilder base64 an Claude gesendet oder als URL?
3. **Rate Limiting:** Brauchen wir das bei Single-User?
4. **Backup:** Automatisches SQLite Backup gewünscht?

---

*Erstellt von Claude (Subagent) für Donki/OpenClaw*


---

## 13. WICHTIG: Session-Sharing

**Anforderung:** Das neue Chat-UI und das Standard OpenClaw WebUI müssen die **GLEICHE SESSION** nutzen!

**Grund:** Wenn chat.opendonki.de Probleme hat, muss Lennart nahtlos ins Standard-WebUI wechseln können als Backup.

**Umsetzung:**
- Beide UIs verbinden sich zur gleichen OpenClaw Gateway Session
- Session-Key: `agent:main:main` (die Haupt-Session)
- Keine separate Session erstellen!

**Technisch:**
- OpenClaw Gateway API nutzen (nicht eigene Chat-Logik)
- WebSocket oder SSE zum Gateway
- Session-Token teilen (oder beide ohne Auth wenn lokal)

