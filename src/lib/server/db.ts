import Database from 'better-sqlite3';
import { join } from 'path';
import { env } from '$env/dynamic/private';

const dbPath = env.DATABASE_PATH || './data/chat.db';

export const db = new Database(dbPath);

// Enable WAL mode for better concurrent access
db.pragma('journal_mode = WAL');

// Initialize schema
export function initializeDatabase() {
  db.exec(`
    -- Conversations
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      title TEXT,
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
  `);
}

// Initialize on import
initializeDatabase();

// Helper functions
export function createConversation(id: string, title?: string) {
  const stmt = db.prepare('INSERT INTO conversations (id, title) VALUES (?, ?)');
  return stmt.run(id, title || 'New Chat');
}

export function getConversation(id: string) {
  const stmt = db.prepare('SELECT * FROM conversations WHERE id = ?');
  return stmt.get(id);
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

export function getMessages(conversationId: string) {
  const stmt = db.prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC');
  return stmt.all(conversationId);
}

export function deleteMessages(conversationId: string) {
  const stmt = db.prepare('DELETE FROM messages WHERE conversation_id = ?');
  return stmt.run(conversationId);
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
