const Database = require('better-sqlite3');
const db = new Database('./data/chat.db');

console.log('=== Conversations Table Schema ===');
const schema = db.prepare("PRAGMA table_info(conversations)").all();
console.log(schema);

console.log('\n=== All Conversations ===');
const all = db.prepare('SELECT * FROM conversations ORDER BY created_at DESC LIMIT 10').all();
console.log(all);

db.close();
