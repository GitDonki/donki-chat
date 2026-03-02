# Team-Sidebar Konzept für Donki Chat

**Erstellt:** 2026-03-02
**Autor:** Claude (Subagent)
**Status:** Konzept
**Letzte Aktualisierung:** 2026-03-02 (Multi-Agent Chat)

---

## Änderungshistorie

| Datum | Änderung |
|-------|----------|
| 2026-03-02 | Initial-Konzept mit Team-Sidebar |
| 2026-03-02 | **MAJOR UPDATE:** Multi-Agent Chat - Direkter Chat mit jedem Agent |

---

## 1. Recherche-Ergebnisse

### 1.1 OpenClaw Sessions Architektur

**Session-Struktur:**
```
agent:<agentId>:<sessionName>
```
Beispiele:
- `agent:main:main` - Donkis Haupt-Session
- `agent:claude:subagent:abc123` - Claude Subagent Session
- `agent:nabu:main` - Nabus Haupt-Session

**Wichtige Erkenntnisse:**

1. **Agents sind isoliert** - Jeder Agent hat eigenen Workspace + Sessions
   - Sessions unter: `/config/.openclaw/agents/{agentId}/sessions/sessions.json`
   - Identität via `IDENTITY.md` (Name, Emoji, etc.)

2. **Gateway API** für Session-Status:
   ```bash
   openclaw gateway call health --json
   openclaw gateway call status --json
   ```
   Liefert:
   - `agents[]` mit `agentId`, `isDefault`, `heartbeat.enabled`
   - `sessions.recent[]` mit `key`, `updatedAt`, `age`

3. **Chat Events** werden via WebSocket-Events verbreitet:
   - Event-Type: `chat`
   - Payload enthält `role`, `content`, `runId`, `state`
   - SSE-Bridge in `/api/chat/events` leitet an Frontend weiter

### 1.2 Donki Chat Architektur (aktuell)

**Gateway-Verbindung:**
- `gateway-ws.ts`: Singleton WebSocket zu `wss://192.168.0.155:18789`
- Authentifizierung via Token im `connect` Request
- Session-Key hardcoded: `agent:main:main`

---

## 2. Multi-Agent Chat Konzept (NEU)

### 2.1 Kernidee

**Vorher:** Alles geht an Donki
**Neu:** User hat die WAHL - Donki ODER direkt mit einem Agent

```
┌─────────────────────────────────────────────────────────────────────┐
│                         MULTI-AGENT CHAT                            │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│   ┌─────────────────────────────────────────────────────────────┐   │
│   │                    OPTION A: Via Donki                      │   │
│   │                    (wie bisher, bleibt!)                    │   │
│   │                                                             │   │
│   │   User ──► Donki ──► spawnt Claude für Coding-Task          │   │
│   │                  ──► fragt Nabu nach Wetter                 │   │
│   │                  ──► Donki koordiniert alles                │   │
│   └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│   ┌─────────────────────────────────────────────────────────────┐   │
│   │                    OPTION B: Direkt                         │   │
│   │                    (NEU, zusätzlich)                        │   │
│   │                                                             │   │
│   │   User ──► Nabu      (direkt, ohne Donki)                   │   │
│   │   User ──► Claude    (direkt, ohne Donki)                   │   │
│   │   User ──► Archie    (direkt, ohne Donki)                   │   │
│   └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│   User entscheidet! Beide Wege möglich.                            │
│   Jeder Agent = Separate Conversation = Eigene History              │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.2 Kern-Prinzipien

1. **Donki bleibt Chef** - Kann weiterhin alle Agents koordinieren (sessions_send, Subagents)
2. **User hat die Wahl** - Direkt mit Agent chatten ODER über Donki
3. **Eigene History** - Jeder Agent hat separate Chat-Historie in DB
4. **One-Click Switch** - Klick auf Agent = dessen Chat wird geladen
5. **Default = Donki** - Bei Seitenstart wird Donki + dessen History geladen
6. **Persistente Conversations** - Eine feste Conversation pro Agent (nicht löschbar)

---

## 3. Architektur-Übersicht

```
┌─────────────────────────────────────────────────────────────────────┐
│                           FRONTEND                                  │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│   TeamSidebar.svelte              ChatArea.svelte                   │
│   ┌─────────────────────────┐     ┌─────────────────────────────┐  │
│   │ 🐧 Donki (Chef)    [●] │ ──► │ Chat mit DONKI              │  │
│   │ 🦉 Nabu            [○] │     │ ┌─────────────────────────┐ │  │
│   │ 💻 Claude          [●] │     │ │ History geladen aus DB  │ │  │
│   │ 🐹 Archie          [○] │     │ │ für agent_id='main'     │ │  │
│   └─────────────────────────┘     │ └─────────────────────────┘ │  │
│            │                      └─────────────────────────────┘  │
│            │ Klick auf Nabu                                        │
│            ▼                                                        │
│   ┌─────────────────────────┐     ┌─────────────────────────────┐  │
│   │ 🐧 Donki (Chef)    [○] │     │ Chat mit NABU               │  │
│   │ 🦉 Nabu     >>>>   [●] │ ──► │ ┌─────────────────────────┐ │  │
│   │ 💻 Claude          [○] │     │ │ History geladen aus DB  │ │  │
│   │ 🐹 Archie          [○] │     │ │ für agent_id='nabu'     │ │  │
│   └─────────────────────────┘     │ └─────────────────────────────┘  │
│                                                                     │
│   State: selectedAgent = 'nabu'                                    │
│   Gateway Session: agent:nabu:main                                  │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                            BACKEND                                  │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│   API Endpoints:                                                    │
│   ├─ GET  /api/team/status         → Alle Agents + Status          │
│   ├─ GET  /api/chat/history?agent= → History für spezifischen Agent│
│   ├─ POST /api/chat                → Mit agentId Parameter         │
│   └─ GET  /api/chat/events?agent=  → SSE für spezifischen Agent    │
│                                                                     │
│   Database:                                                         │
│   ├─ conversations (mit agent_id Spalte)                           │
│   └─ messages (gehören zu conversation → gehören zu agent)         │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                       OpenClaw Gateway                              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│   Dynamische Session je nach selectedAgent:                         │
│   ├─ agent:main:main   ← für Donki                                 │
│   ├─ agent:nabu:main   ← für Nabu                                  │
│   ├─ agent:claude:main ← für Claude                                │
│   └─ agent:archie:main ← für Archie                                │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 4. Datenbank-Schema (NEU)

### 4.1 Bestehende Tabellen (Referenz)

```sql
-- Aktuelles Schema (zu ändern)
CREATE TABLE conversations (
  id TEXT PRIMARY KEY,
  title TEXT,
  created_at INTEGER,
  updated_at INTEGER
);

CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT,
  role TEXT,
  content TEXT,
  images TEXT,
  reactions TEXT,
  created_at INTEGER,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id)
);
```

### 4.2 Schema-Änderungen

```sql
-- Option A: agent_id Spalte hinzufügen
ALTER TABLE conversations ADD COLUMN agent_id TEXT DEFAULT 'main';

-- Index für schnelle Abfragen
CREATE INDEX idx_conversations_agent ON conversations(agent_id);

-- Default-Conversations für jeden Agent anlegen
INSERT OR IGNORE INTO conversations (id, agent_id, title, created_at, updated_at)
VALUES 
  ('conv_main', 'main', 'Chat mit Donki', strftime('%s','now'), strftime('%s','now')),
  ('conv_nabu', 'nabu', 'Chat mit Nabu', strftime('%s','now'), strftime('%s','now')),
  ('conv_claude', 'claude', 'Chat mit Claude', strftime('%s','now'), strftime('%s','now')),
  ('conv_archie', 'archie', 'Chat mit Archie', strftime('%s','now'), strftime('%s','now'));
```

### 4.3 Konzept: Eine Conversation pro Agent

**Wichtig:** Jeder Agent hat genau EINE feste Conversation:
- Nicht löschbar durch User
- Wird beim ersten Start automatisch angelegt
- ID-Schema: `conv_{agentId}` (z.B. `conv_main`, `conv_nabu`)

```typescript
// lib/server/db/agents.ts
const TEAM_AGENTS = ['main', 'nabu', 'claude', 'archie'] as const;

export function ensureAgentConversations(db: Database) {
  for (const agentId of TEAM_AGENTS) {
    const existing = db.prepare(
      'SELECT id FROM conversations WHERE agent_id = ?'
    ).get(agentId);
    
    if (!existing) {
      db.prepare(`
        INSERT INTO conversations (id, agent_id, title, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(
        `conv_${agentId}`,
        agentId,
        `Chat mit ${getAgentName(agentId)}`,
        Date.now(),
        Date.now()
      );
    }
  }
}
```

---

## 5. API-Design (Aktualisiert)

### 5.1 GET /api/team/status

Holt den aktuellen Status aller Team-Mitglieder vom Gateway.

**Response:**
```json
{
  "ok": true,
  "members": [
    {
      "id": "main",
      "name": "Donki",
      "emoji": "🐧",
      "role": "Chef",
      "sessionKey": "agent:main:main",
      "status": "active",
      "lastActivity": "2026-03-02T12:30:00Z",
      "isDefault": true,
      "conversationId": "conv_main"
    }
  ]
}
```

### 5.2 GET /api/chat/history (GEÄNDERT)

**Neu:** Query-Parameter `agent` für Agent-Filter.

**Request:**
```http
GET /api/chat/history?agent=nabu
GET /api/chat/history?agent=main   (default wenn nicht angegeben)
```

**Response:**
```json
{
  "ok": true,
  "conversationId": "conv_nabu",
  "agentId": "nabu",
  "messages": [
    {
      "id": "msg_123",
      "role": "user",
      "content": "Hey Nabu, wie ist das Wetter?",
      "createdAt": "2026-03-02T12:00:00Z"
    },
    {
      "id": "msg_124",
      "role": "assistant",
      "content": "Aktuell 12°C und bewölkt.",
      "createdAt": "2026-03-02T12:00:05Z"
    }
  ]
}
```

**Implementation:**
```typescript
// routes/api/chat/history/+server.ts
export const GET: RequestHandler = async ({ url }) => {
  const agentId = url.searchParams.get('agent') || 'main';
  
  // Hole Conversation für diesen Agent
  const conversation = db.prepare(
    'SELECT id FROM conversations WHERE agent_id = ?'
  ).get(agentId);
  
  if (!conversation) {
    return json({ ok: false, error: 'Agent not found' }, { status: 404 });
  }
  
  // Lade Messages
  const messages = db.prepare(`
    SELECT * FROM messages 
    WHERE conversation_id = ? 
    ORDER BY created_at ASC
  `).all(conversation.id);
  
  return json({
    ok: true,
    conversationId: conversation.id,
    agentId,
    messages
  });
};
```

### 5.3 POST /api/chat (GEÄNDERT)

**Neu:** `agentId` Parameter um zu bestimmen, an welchen Agent die Message geht.

**Request:**
```json
{
  "message": "Hey Nabu, was gibt's Neues?",
  "agentId": "nabu",
  "images": []
}
```

**Implementation-Änderungen:**
```typescript
// routes/api/chat/+server.ts
export const POST: RequestHandler = async ({ request }) => {
  const { message, agentId = 'main', images } = await request.json();
  
  // 1. Richtige Conversation ermitteln
  const conversation = db.prepare(
    'SELECT id FROM conversations WHERE agent_id = ?'
  ).get(agentId);
  
  // 2. User-Message speichern
  saveMessage(conversation.id, 'user', message);
  
  // 3. An Gateway senden mit dynamischer Session
  const sessionKey = `agent:${agentId}:main`;
  
  await gateway.send('chat.send', {
    sessionKey,
    content: message,
    images
  });
  
  // 4. Streaming Response...
};
```

### 5.4 GET /api/chat/events (GEÄNDERT)

**Neu:** Query-Parameter `agent` für SSE-Filter.

**Request:**
```http
GET /api/chat/events?agent=nabu
```

**Behavior:**
- Nur Events von diesem Agent werden gestreamt
- Bei Agent-Wechsel: neue SSE-Connection aufbauen

---

## 6. Frontend-Architektur (NEU)

### 6.1 State Management

```typescript
// lib/stores/agent.ts
import { writable, derived } from 'svelte/store';

// Aktuell ausgewählter Agent
export const selectedAgentId = writable<string>('main');

// Team-Mitglieder mit Status
export const teamMembers = writable<TeamMember[]>([]);

// Derived: Aktuell ausgewählter Agent (vollständig)
export const selectedAgent = derived(
  [selectedAgentId, teamMembers],
  ([$selectedAgentId, $teamMembers]) => 
    $teamMembers.find(m => m.id === $selectedAgentId) || null
);

// Funktion: Agent wechseln
export async function selectAgent(agentId: string) {
  selectedAgentId.set(agentId);
  
  // History für diesen Agent laden
  await loadHistory(agentId);
  
  // SSE-Connection wechseln
  reconnectSSE(agentId);
}
```

### 6.2 Chat Store (GEÄNDERT)

```typescript
// lib/stores/chat.ts
import { writable, get } from 'svelte/store';
import { selectedAgentId } from './agent';

export const messages = writable<ChatMessage[]>([]);
export const isLoading = writable(false);

// History für spezifischen Agent laden
export async function loadHistory(agentId?: string) {
  const agent = agentId || get(selectedAgentId);
  isLoading.set(true);
  
  try {
    const res = await fetch(`/api/chat/history?agent=${agent}`);
    const data = await res.json();
    
    if (data.ok) {
      messages.set(data.messages);
    }
  } finally {
    isLoading.set(false);
  }
}

// Message senden (an aktuell ausgewählten Agent)
export async function sendMessage(content: string, images?: string[]) {
  const agentId = get(selectedAgentId);
  
  // Optimistic UI: User-Message sofort zeigen
  const userMsg: ChatMessage = {
    id: `temp_${Date.now()}`,
    role: 'user',
    content,
    images,
    createdAt: new Date()
  };
  messages.update(m => [...m, userMsg]);
  
  // An Backend senden
  await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: content, agentId, images })
  });
}
```

### 6.3 SSE-Connection Management

```typescript
// lib/stores/sse.ts
let currentEventSource: EventSource | null = null;
let currentAgentId: string | null = null;

export function connectSSE(agentId: string) {
  // Alte Connection schließen
  if (currentEventSource) {
    currentEventSource.close();
  }
  
  // Neue Connection für diesen Agent
  currentAgentId = agentId;
  currentEventSource = new EventSource(`/api/chat/events?agent=${agentId}`);
  
  currentEventSource.onmessage = (event) => {
    const data = JSON.parse(event.data);
    handleSSEEvent(data);
  };
  
  currentEventSource.onerror = () => {
    // Reconnect nach 5s
    setTimeout(() => {
      if (currentAgentId === agentId) {
        connectSSE(agentId);
      }
    }, 5000);
  };
}

export function disconnectSSE() {
  if (currentEventSource) {
    currentEventSource.close();
    currentEventSource = null;
    currentAgentId = null;
  }
}
```

---

## 7. Frontend-Flow

### 7.1 Seitenstart

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. Page Mount (+page.svelte onMount)                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   ┌─────────────┐      ┌─────────────┐      ┌─────────────┐    │
│   │ loadTeam()  │ ───► │ selectAgent │ ───► │ loadHistory │    │
│   │ Status API  │      │   ('main')  │      │ (Donki DB)  │    │
│   └─────────────┘      └─────────────┘      └─────────────┘    │
│                                                    │            │
│                                                    ▼            │
│                                             ┌─────────────┐    │
│                                             │ connectSSE  │    │
│                                             │ (agent:main)│    │
│                                             └─────────────┘    │
│                                                                 │
│   → Default: Donki ausgewählt, dessen History geladen           │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 7.2 Agent-Wechsel (Klick in Sidebar)

```
┌─────────────────────────────────────────────────────────────────┐
│ User klickt auf "Nabu" in der Sidebar                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   ┌──────────────────┐                                         │
│   │ selectAgent      │                                         │
│   │   ('nabu')       │                                         │
│   └────────┬─────────┘                                         │
│            │                                                    │
│            ▼                                                    │
│   ┌──────────────────────────────────────────────────────┐     │
│   │ 1. selectedAgentId.set('nabu')                       │     │
│   │ 2. messages.set([])  // Clear                        │     │
│   │ 3. loadHistory('nabu')  // Lade Nabu-History         │     │
│   │ 4. disconnectSSE()                                   │     │
│   │ 5. connectSSE('nabu')  // Neue SSE für Nabu          │     │
│   └──────────────────────────────────────────────────────┘     │
│                                                                 │
│   → Chat zeigt jetzt Nabu's Historie                           │
│   → Neue Messages gehen an agent:nabu:main                     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 7.3 Message senden (an aktuellen Agent)

```
┌─────────────────────────────────────────────────────────────────┐
│ User tippt und drückt Enter (selectedAgent = 'nabu')           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   ┌───────────────┐     ┌───────────────┐     ┌─────────────┐  │
│   │ sendMessage() │ ──► │ POST /api/chat│ ──► │ Gateway WS  │  │
│   │ content='...' │     │ agentId='nabu'│     │ session:    │  │
│   └───────────────┘     └───────────────┘     │ nabu:main   │  │
│                                               └──────┬──────┘  │
│                                                      │         │
│                                                      ▼         │
│                                               ┌─────────────┐  │
│                                               │ Nabu Agent  │  │
│                                               │ antwortet   │  │
│                                               └──────┬──────┘  │
│                                                      │         │
│                                                      ▼         │
│   ┌───────────────┐     ┌───────────────┐     ┌─────────────┐  │
│   │ UI Update     │ ◄── │ SSE Event     │ ◄── │ Gateway     │  │
│   │ messages.push │     │ (streaming)   │     │ broadcast   │  │
│   └───────────────┘     └───────────────┘     └─────────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 8. UI-Design

### 8.1 TeamSidebar mit Selection State

```
┌──────────────────────────────────────┐
│  🐧 Donki Team                       │
├──────────────────────────────────────┤
│                                      │
│  ┌────────────────────────────────┐  │ ← Selected (hervorgehoben)
│  │ 🐧 Donki                   ●   │  │
│  │    Chef                        │  │
│  └────────────────────────────────┘  │
│                                      │
│    🦉 Nabu                    ○      │ ← Klickbar
│       Home Assistant                 │
│                                      │
│    💻 Claude                  ●      │ ← Klickbar
│       Coding                         │
│                                      │
│    🐹 Archie                  ○      │ ← Klickbar
│       Archivar                       │
│                                      │
├──────────────────────────────────────┤
│  ⚙️ Einstellungen                    │
└──────────────────────────────────────┘

● = aktiv (grün)
○ = idle (grau)
⟳ = working (gelb, pulsing)
```

### 8.2 Chat-Header zeigt aktuellen Agent

```
┌─────────────────────────────────────────────────────────────────┐
│  🦉 Chat mit Nabu                                        [←]   │  ← Header mit Agent-Info
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Nabu • vor 5 Minuten                                     │  │
│  │ Hey! Ich bin Nabu, dein Home Assistant.                  │  │
│  │ Frag mich alles über dein Smart Home.                    │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│                           ┌─────────────────────────────────┐  │
│                           │ Wie ist das Wetter?             │  │
│                           └─────────────────────────────────┘  │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Nabu • gerade eben                                       │  │
│  │ Aktuell 12°C und bewölkt. Soll ich das                  │  │
│  │ Wetter-Widget auf dem Dashboard aktualisieren?          │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
│ [Nachricht an Nabu eingeben...]                          [📎] │
└─────────────────────────────────────────────────────────────────┘
```

---

## 9. Neue/Geänderte Dateien

### Backend

| Datei | Aktion | Beschreibung |
|-------|--------|--------------|
| `lib/server/db/schema.ts` | ÄNDERN | `agent_id` Spalte in conversations |
| `lib/server/db/agents.ts` | NEU | Agent-Conversation Management |
| `routes/api/team/status/+server.ts` | NEU | Team-Status Endpoint |
| `routes/api/chat/history/+server.ts` | ÄNDERN | `agent` Query-Parameter |
| `routes/api/chat/+server.ts` | ÄNDERN | `agentId` im Request Body |
| `routes/api/chat/events/+server.ts` | ÄNDERN | `agent` Query-Parameter für SSE |
| `lib/server/gateway-ws.ts` | ÄNDERN | Dynamische Session-Keys |

### Frontend

| Datei | Aktion | Beschreibung |
|-------|--------|--------------|
| `lib/stores/agent.ts` | NEU | Agent-Selection Store |
| `lib/stores/chat.ts` | ÄNDERN | Agent-aware History laden |
| `lib/stores/sse.ts` | NEU | SSE-Connection Management |
| `lib/components/TeamSidebar.svelte` | NEU | Sidebar mit Agent-Liste |
| `lib/components/ChatHeader.svelte` | NEU | Header mit aktuellem Agent |
| `routes/+page.svelte` | ÄNDERN | Agent-Stores integrieren |

---

## 10. Implementierungs-Schritte (Aktualisiert)

### Phase 1: Database (Prio: KRITISCH)

1. **Schema Migration**
   - `agent_id` Spalte zu `conversations` hinzufügen
   - Default-Conversations für alle Agents anlegen
   - Migration-Script schreiben

2. **Agent-Conversation Logik**
   - `ensureAgentConversations()` beim Start
   - `getConversationForAgent(agentId)` Funktion

### Phase 2: Backend APIs (Prio: HOCH)

3. **`/api/team/status`**
   - Gateway health call
   - Team-Config mergen
   - ConversationIds inkludieren

4. **`/api/chat/history` erweitern**
   - `agent` Query-Parameter
   - Lade History für spezifischen Agent

5. **`/api/chat` erweitern**
   - `agentId` aus Request Body
   - Dynamische Session-Key Generierung

6. **`/api/chat/events` erweitern**
   - `agent` Query-Parameter
   - Filter Events nach Agent

### Phase 3: Frontend Stores (Prio: HOCH)

7. **`agent.ts` Store**
   - `selectedAgentId` writable
   - `teamMembers` writable
   - `selectAgent()` Funktion

8. **`chat.ts` anpassen**
   - `loadHistory(agentId)` 
   - `sendMessage()` mit agentId

9. **`sse.ts` erstellen**
   - `connectSSE(agentId)`
   - `disconnectSSE()`
   - Reconnect-Logic

### Phase 4: UI Components (Prio: MITTEL)

10. **`TeamSidebar.svelte`**
    - Agent-Liste mit Status
    - Selection State (highlighted)
    - OnClick → `selectAgent()`

11. **`ChatHeader.svelte`**
    - Zeigt aktuellen Agent (Emoji + Name)
    - Optional: Back-Button zu Donki

12. **`+page.svelte` anpassen**
    - Agent-Stores einbinden
    - OnMount: `loadTeam()`, `selectAgent('main')`

### Phase 5: Testing & Polish (Prio: NIEDRIG)

13. **Integration Testing**
    - Agent-Wechsel testen
    - History-Persistenz prüfen
    - SSE-Reconnect testen

14. **UX Polish**
    - Loading States
    - Error Handling
    - Mobile Responsiveness

---

## 11. Offene Fragen (Aktualisiert)

1. ~~**Soll man direkt mit einem Agent chatten können?**~~ ✅ JA - als Option, Donki bleibt Standard

2. **WebSocket vs SSE pro Agent?**
   - Option A: Eine SSE-Connection, bei Agent-Wechsel neue aufbauen ← **Empfohlen**
   - Option B: Mehrere parallele Connections (komplexer)

3. **Was passiert wenn Agent offline?**
   - Message queuen? Oder Fehlermeldung?
   - Status-Check vor dem Senden?

4. **Message-Sync zwischen Agents?**
   - Wenn Nabu was an Donki weitergibt, zeigt das im Donki-Chat?
   - Oder separate Conversations = strikt getrennt?
   - **Hinweis:** Donki kann weiterhin intern mit Agents kommunizieren, das ist unabhängig von den User-facing Conversations

---

## 12. Zusammenfassung

Das aktualisierte Konzept **erweitert** Donki Chat um **optionalen Multi-Agent Chat**:

| Vorher | Nachher |
|--------|---------|
| Alles geht an Donki | **Zusätzlich:** Direkter Chat mit jedem Agent möglich |
| Eine Chat-Historie | Separate Historie pro Agent |
| Statische Session | Dynamische Session je nach ausgewähltem Agent |
| Donki koordiniert | Donki koordiniert weiterhin, User hat aber die Wahl |

**Wichtig:** Donki bleibt das Zentrum! Er kann weiterhin:
- Subagents spawnen (Claude für Coding etc.)
- Mit allen Agents kommunizieren (sessions_send)
- Tasks koordinieren und delegieren

**Der User hat jetzt zusätzlich die Option**, direkt mit einem Agent zu chatten - muss aber nicht.

**Kern-Änderungen:**
- **DB:** `agent_id` Spalte, eine Conversation pro Agent
- **API:** `agentId` Parameter durchgängig
- **Frontend:** `selectedAgent` State, Agent-Wechsel-Flow
- **Gateway:** Dynamische Session-Keys

**Geschätzter Aufwand (aktualisiert):**
- Database + Backend: ~6-8h
- Frontend Stores + Logic: ~4-6h
- UI Components: ~4-6h
- Testing/Polish: ~2-4h
- **Total: ~16-24h**
