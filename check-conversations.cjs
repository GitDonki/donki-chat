const Database = require('better-sqlite3');
const db = new Database('./data/chat.db');

console.log('=== All Conversations ===');
const all = db.prepare('SELECT id, title, agent_id, created_at FROM conversations ORDER BY created_at DESC').all();
console.log(all);

console.log('\n=== Agent Conversations Only ===');
const agentIds = ['conv_main', 'conv_nabu', 'conv_forge', 'conv_claude', 'conv_archie'];
const placeholders = agentIds.map(() => '?').join(',');
const agents = db.prepare(`SELECT id, title, agent_id, created_at FROM conversations WHERE id IN (${placeholders}) ORDER BY created_at DESC`).all(...agentIds);
console.log(agents);

console.log('\n=== Duplicate Check ===');
const duplicates = db.prepare(`
  SELECT agent_id, COUNT(*) as count 
  FROM conversations 
  WHERE agent_id IS NOT NULL
  GROUP BY agent_id 
  HAVING count > 1
`).all();
console.log(duplicates.length > 0 ? duplicates : 'No duplicates');

db.close();
