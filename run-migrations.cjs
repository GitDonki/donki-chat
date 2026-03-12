const Database = require('better-sqlite3');
const db = new Database('./data/chat.db');

console.log('=== Running Migrations ===\n');

// Migration 1: Add agent_id
try {
  db.exec(`ALTER TABLE conversations ADD COLUMN agent_id TEXT DEFAULT 'main'`);
  console.log('✅ Added agent_id column to conversations');
} catch (e) {
  console.log('ℹ️  agent_id column already exists');
}

// Migration 2: Add archived
try {
  db.exec(`ALTER TABLE conversations ADD COLUMN archived INTEGER DEFAULT 0`);
  console.log('✅ Added archived column to conversations');
} catch (e) {
  console.log('ℹ️  archived column already exists');
}

// Create index
try {
  db.exec(`CREATE INDEX IF NOT EXISTS idx_conversations_agent ON conversations(agent_id)`);
  console.log('✅ Created index on agent_id');
} catch (e) {
  console.log('⚠️  Index creation failed:', e.message);
}

// Ensure agent conversations exist
const TEAM_AGENTS = [
  { id: 'main', name: 'Donki' },
  { id: 'nabu', name: 'Nabu' },
  { id: 'forge', name: 'Forge' },
  { id: 'claude', name: 'Claude' },
  { id: 'archie', name: 'Archie' }
];

console.log('\n=== Creating Agent Conversations ===\n');

for (const agent of TEAM_AGENTS) {
  const convId = `conv_${agent.id}`;
  const existing = db.prepare('SELECT id FROM conversations WHERE id = ?').get(convId);
  
  if (!existing) {
    db.prepare(`
      INSERT INTO conversations (id, agent_id, title, created_at, updated_at)
      VALUES (?, ?, ?, datetime('now'), datetime('now'))
    `).run(convId, agent.id, `Chat mit ${agent.name}`);
    console.log(`✅ Created conversation for ${agent.name}: ${convId}`);
  } else {
    console.log(`ℹ️  Conversation for ${agent.name} already exists`);
  }
}

console.log('\n=== Schema after migrations ===\n');
const schema = db.prepare("PRAGMA table_info(conversations)").all();
console.log(schema);

console.log('\n=== All Conversations ===\n');
const all = db.prepare('SELECT * FROM conversations ORDER BY created_at DESC').all();
console.log(all);

db.close();
console.log('\n✅ Migrations complete!');
