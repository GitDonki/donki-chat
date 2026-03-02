import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { gateway } from '$lib/server/gateway-ws';
import { 
  getMessage, 
  getMessageByContent, 
  addMessage, 
  getConversation, 
  createConversation,
  getAgentConversation,
  getMessages,
  TEAM_AGENTS
} from '$lib/server/db';

export const GET: RequestHandler = async ({ url }) => {
  const agentId = url.searchParams.get('agent') || 'main';
  const limit = parseInt(url.searchParams.get('limit') || '100', 10);
  const source = url.searchParams.get('source'); // 'gateway' | 'db' | undefined
  
  // Validate agent
  const agent = TEAM_AGENTS.find(a => a.id === agentId);
  if (!agent) {
    return json({ ok: false, error: 'Agent not found' }, { status: 404 });
  }
  
  try {
    // If source=db or not specified, try to get from local DB first
    if (source !== 'gateway') {
      const conversation = getAgentConversation(agentId);
      if (conversation) {
        const dbMessages = getMessages(conversation.id);
        if (dbMessages && dbMessages.length > 0) {
          return json({
            ok: true,
            conversationId: conversation.id,
            agentId,
            messages: dbMessages,
            source: 'db'
          });
        }
      }
    }
    
    // Fallback to gateway or if source=gateway
    if (!gateway.isConnected()) {
      await gateway.connect();
    }
    
    const messages = await gateway.getHistory(limit, agentId);
    
    return json({ 
      ok: true,
      conversationId: `conv_${agentId}`,
      agentId,
      messages,
      source: 'gateway'
    });
  } catch (error) {
    console.error('[History API] Error:', error);
    return json({ 
      ok: false, 
      error: error instanceof Error ? error.message : 'Failed to fetch history',
      messages: []
    }, { status: 500 });
  }
};

// POST: Sync messages to local DB for a specific agent
export const POST: RequestHandler = async ({ request }) => {
  try {
    const { messages, agentId = 'main' } = await request.json();
    
    if (!messages || !Array.isArray(messages)) {
      return json({ ok: false, error: 'messages array required' }, { status: 400 });
    }
    
    // Validate agent
    const agent = TEAM_AGENTS.find(a => a.id === agentId);
    if (!agent) {
      return json({ ok: false, error: 'Agent not found' }, { status: 404 });
    }
    
    // Use the agent's dedicated conversation
    const conversationId = `conv_${agentId}`;
    
    // Ensure conversation exists
    if (!getConversation(conversationId)) {
      createConversation(conversationId, `Chat mit ${agent.name}`);
    }
    
    const idMap: Record<string, string> = {}; // originalId -> dbId
    
    for (const msg of messages) {
      if (!msg.id || !msg.content) continue;
      
      // First: Check if this exact ID exists
      const existingById = getMessage(msg.id);
      if (existingById) {
        idMap[msg.id] = msg.id;
        continue;
      }
      
      // Second: Check if a message with same content exists (content-based dedup)
      const existingByContent = getMessageByContent(msg.role, msg.content, conversationId);
      if (existingByContent) {
        idMap[msg.id] = existingByContent.id;
        console.log('[History Sync] Found existing message by content, mapping', msg.id, '->', existingByContent.id);
        continue;
      }
      
      // Save new message to DB
      try {
        addMessage(
          msg.id,
          conversationId,
          msg.role || 'assistant',
          msg.content || '',
          msg.images
        );
        idMap[msg.id] = msg.id;
        console.log('[History Sync] Saved new message for agent', agentId, ':', msg.id);
      } catch (e) {
        const fallback = getMessageByContent(msg.role, msg.content, conversationId);
        if (fallback) {
          idMap[msg.id] = fallback.id;
        }
        console.warn('[History Sync] Could not save message:', msg.id, e);
      }
    }
    
    return json({ ok: true, idMap, saved: Object.keys(idMap).length, agentId });
  } catch (error) {
    console.error('[History Sync] Error:', error);
    return json({ 
      ok: false, 
      error: error instanceof Error ? error.message : 'Sync failed' 
    }, { status: 500 });
  }
};
