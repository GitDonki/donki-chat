import Database from 'better-sqlite3';
import { join } from 'path';
import { env } from '$env/dynamic/private';

const dbPath = env.DATABASE_PATH || './data/chat.db';

export const db = new Database(dbPath);

// Enable WAL mode for better concurrent access
db.pragma('journal_mode = WAL');

// Team agents configuration
export const TEAM_AGENTS = [
  { id: 'main', name: 'Donki', emoji: '🐧', role: 'Chef', sessionKey: 'agent:main:main', isDefault: true },
  { id: 'nabu', name: 'Nabu', emoji: '🦉', role: 'Home Assistant', sessionKey: 'agent:nabu:main', isDefault: false },
  { id: 'forge', name: 'Forge', emoji: '🔧', role: 'Infrastructure', sessionKey: 'agent:forge:main', isDefault: false },
  { id: 'claude', name: 'Claude', emoji: '💻', role: 'Coding', sessionKey: 'agent:claude:main', isDefault: false },
  { id: 'archie', name: 'Archie', emoji: '🐹', role: 'Archivar', sessionKey: 'agent:archie:main', isDefault: false }
] as const;

export type AgentId = typeof TEAM_AGENTS[number]['id'];

// Database row types
export interface ConversationRow {
  id: string;
  title: string;
  agent_id: string;
  created_at: string;
  updated_at: string;
}

export interface MessageRow {
  id: string;
  conversation_id: string;
  role: string;
  content: string;
  images: string | null;
  reactions: string | null;
  created_at: string;
}

// Initialize schema
export function initializeDatabase() {
  db.exec(`
    -- Conversations
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      title TEXT,
      agent_id TEXT DEFAULT 'main',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Messages  
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      images TEXT,
      reactions TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
    );

    -- Uploads
    CREATE TABLE IF NOT EXISTS uploads (
      id TEXT PRIMARY KEY,
      filename TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size INTEGER NOT NULL,
      path TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Sessions (für Auth)
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      expires_at DATETIME NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Indexes
    CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
    CREATE INDEX IF NOT EXISTS idx_conversations_agent ON conversations(agent_id);
  `);
  
  // Safe migration for existing databases - add reactions column if not exists
  try {
    db.exec(`ALTER TABLE messages ADD COLUMN reactions TEXT`);
  } catch (e) {
    // Column already exists, ignore
  }
  
  // Migration: Add agent_id column if not exists
  try {
    db.exec(`ALTER TABLE conversations ADD COLUMN agent_id TEXT DEFAULT 'main'`);
    console.log('[DB] Added agent_id column to conversations');
  } catch (e) {
    // Column already exists, ignore
  }
  
  // Ensure all team agents have their default conversations
  ensureAgentConversations();
}

// Ensure each agent has a dedicated conversation
export function ensureAgentConversations() {
  for (const agent of TEAM_AGENTS) {
    const convId = `conv_${agent.id}`;
    const existing = db.prepare('SELECT id FROM conversations WHERE id = ?').get(convId);
    
    if (!existing) {
      db.prepare(`
        INSERT INTO conversations (id, agent_id, title, created_at, updated_at)
        VALUES (?, ?, ?, datetime('now'), datetime('now'))
      `).run(convId, agent.id, `Chat mit ${agent.name}`);
      console.log(`[DB] Created conversation for agent ${agent.id}: ${convId}`);
    }
  }
}

// Get agent info by ID
export function getAgentById(agentId: string) {
  return TEAM_AGENTS.find(a => a.id === agentId);
}

// Get conversation for a specific agent
export function getAgentConversation(agentId: string): ConversationRow | undefined {
  const convId = `conv_${agentId}`;
  return db.prepare('SELECT * FROM conversations WHERE id = ?').get(convId) as ConversationRow | undefined;
}

// Initialize on import
initializeDatabase();

// Helper functions
export function createConversation(id: string, title?: string) {
  const stmt = db.prepare('INSERT INTO conversations (id, title) VALUES (?, ?)');
  return stmt.run(id, title || 'New Chat');
}

export function getConversation(id: string): ConversationRow | undefined {
  const stmt = db.prepare('SELECT * FROM conversations WHERE id = ?');
  return stmt.get(id) as ConversationRow | undefined;
}

export function updateConversationTitle(id: string, title: string) {
  const stmt = db.prepare('UPDATE conversations SET title = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
  return stmt.run(title, id);
}

export function getAllConversations() {
  const stmt = db.prepare('SELECT * FROM conversations ORDER BY updated_at DESC');
  return stmt.all();
}

export function deleteConversation(id: string) {
  const stmt = db.prepare('DELETE FROM conversations WHERE id = ?');
  return stmt.run(id);
}

export function addMessage(id: string, conversationId: string, role: string, content: string, images?: string[]) {
  const stmt = db.prepare('INSERT INTO messages (id, conversation_id, role, content, images) VALUES (?, ?, ?, ?, ?)');
  const result = stmt.run(id, conversationId, role, content, images ? JSON.stringify(images) : null);
  
  // Update conversation timestamp
  const updateStmt = db.prepare('UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = ?');
  updateStmt.run(conversationId);
  
  return result;
}

export function getMessages(conversationId: string): MessageRow[] {
  const stmt = db.prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC');
  return stmt.all(conversationId) as MessageRow[];
}

export function deleteMessages(conversationId: string) {
  const stmt = db.prepare('DELETE FROM messages WHERE conversation_id = ?');
  return stmt.run(conversationId);
}

export function getMessage(id: string) {
  const stmt = db.prepare('SELECT * FROM messages WHERE id = ?');
  return stmt.get(id) as { id: string; reactions: string | null } | undefined;
}

// Find message by content (for deduplication)
export function getMessageByContent(role: string, content: string, conversationId?: string) {
  // Use content prefix for matching (first 200 chars)
  const contentPrefix = content.slice(0, 200);
  
  let stmt;
  if (conversationId) {
    stmt = db.prepare('SELECT * FROM messages WHERE role = ? AND content LIKE ? AND conversation_id = ? LIMIT 1');
    return stmt.get(role, contentPrefix + '%', conversationId) as { id: string; content: string; role: string; reactions: string | null } | undefined;
  } else {
    stmt = db.prepare('SELECT * FROM messages WHERE role = ? AND content LIKE ? LIMIT 1');
    return stmt.get(role, contentPrefix + '%') as { id: string; content: string; role: string; reactions: string | null } | undefined;
  }
}

export function toggleReaction(messageId: string, emoji: string): string[] {
  const message = getMessage(messageId);
  if (!message) return [];
  
  let reactions: string[] = [];
  if (message.reactions) {
    try {
      reactions = JSON.parse(message.reactions);
    } catch {
      reactions = [];
    }
  }
  
  const idx = reactions.indexOf(emoji);
  if (idx >= 0) {
    reactions.splice(idx, 1);
  } else {
    reactions.push(emoji);
  }
  
  const stmt = db.prepare('UPDATE messages SET reactions = ? WHERE id = ?');
  stmt.run(reactions.length > 0 ? JSON.stringify(reactions) : null, messageId);
  
  return reactions;
}

export function createUpload(id: string, filename: string, mimeType: string, size: number, path: string) {
  const stmt = db.prepare('INSERT INTO uploads (id, filename, mime_type, size, path) VALUES (?, ?, ?, ?, ?)');
  return stmt.run(id, filename, mimeType, size, path);
}

export function getUpload(id: string) {
  const stmt = db.prepare('SELECT * FROM uploads WHERE id = ?');
  return stmt.get(id);
}

export function createSession(id: string, expiresAt: Date) {
  const stmt = db.prepare('INSERT INTO sessions (id, expires_at) VALUES (?, ?)');
  return stmt.run(id, expiresAt.toISOString());
}

export function getSession(id: string) {
  const stmt = db.prepare("SELECT * FROM sessions WHERE id = ? AND expires_at > datetime('now')");
  return stmt.get(id);
}

export function deleteSession(id: string) {
  const stmt = db.prepare('DELETE FROM sessions WHERE id = ?');
  return stmt.run(id);
}

export function cleanExpiredSessions() {
  const stmt = db.prepare("DELETE FROM sessions WHERE expires_at <= datetime('now')");
  return stmt.run();
}
