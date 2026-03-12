#!/usr/bin/env node
/**
 * Cleanup old/duplicate conversations from Donki Chat DB
 * 
 * Keeps only the agent conversations (conv_main, conv_nabu, etc.)
 * Removes all other conversations to fix the duplicates bug
 */

import Database from 'better-sqlite3';
import { join } from 'path';

const dbPath = process.env.DATABASE_PATH || './data/chat.db';

console.log('[Cleanup] Opening database:', dbPath);
const db = new Database(dbPath);

const TEAM_AGENTS = ['main', 'nabu', 'forge', 'claude', 'archie'];
const agentConvIds = TEAM_AGENTS.map(id => `conv_${id}`);

console.log('[Cleanup] Expected conversations:', agentConvIds);

// Get all conversations
const allConvs = db.prepare('SELECT id, title, agent_id FROM conversations').all();
console.log(`[Cleanup] Found ${allConvs.length} conversations in database`);

// Filter out the ones we want to keep
const toKeep = allConvs.filter(c => agentConvIds.includes(c.id));
const toDelete = allConvs.filter(c => !agentConvIds.includes(c.id));

console.log(`[Cleanup] Keeping ${toKeep.length} agent conversations`);
console.log(`[Cleanup] Deleting ${toDelete.length} old/duplicate conversations`);

if (toDelete.length > 0) {
  console.log('\n[Cleanup] Conversations to delete:');
  toDelete.forEach(c => {
    console.log(`  - ${c.id} (${c.title}) [agent_id: ${c.agent_id}]`);
  });
  
  // Delete conversations and their messages
  const deleteConvStmt = db.prepare('DELETE FROM conversations WHERE id = ?');
  const deleteMsgsStmt = db.prepare('DELETE FROM messages WHERE conversation_id = ?');
  
  for (const conv of toDelete) {
    deleteMsgsStmt.run(conv.id);
    deleteConvStmt.run(conv.id);
    console.log(`[Cleanup] Deleted conversation: ${conv.id}`);
  }
  
  console.log(`\n[Cleanup] ✅ Cleanup complete! Removed ${toDelete.length} conversations`);
} else {
  console.log('\n[Cleanup] ✅ No cleanup needed! Database is clean.');
}

db.close();
