import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { gateway } from '$lib/server/gateway-ws';
import { getMessage, getMessageByContent, addMessage, getConversation, createConversation } from '$lib/server/db';

// Default conversation for gateway-synced messages
const GATEWAY_CONVERSATION_ID = 'gateway-sync';

export const GET: RequestHandler = async ({ url }) => {
  const limit = parseInt(url.searchParams.get('limit') || '50', 10);
  
  try {
    // Ensure gateway is connected
    if (!gateway.isConnected()) {
      await gateway.connect();
    }
    
    const messages = await gateway.getHistory(limit);
    
    return json({ 
      ok: true, 
      messages 
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

// POST: Sync gateway messages to local DB so reactions can work
// Returns mapping of originalId -> dbId for frontend to use correct IDs
// NOTE: Gateway messages always go to the dedicated gateway-sync conversation
// to prevent creating multiple "Gateway Chat" entries in sidebar
export const POST: RequestHandler = async ({ request }) => {
  try {
    const { messages, conversationId } = await request.json();
    
    if (!messages || !Array.isArray(messages)) {
      return json({ ok: false, error: 'messages array required' }, { status: 400 });
    }
    
    // ALWAYS use the dedicated gateway conversation for synced messages
    // The conversationId param is only used to check if messages already exist there
    const targetConversationId = GATEWAY_CONVERSATION_ID;
    
    // Ensure the ONE gateway conversation exists (only create once)
    if (!getConversation(targetConversationId)) {
      createConversation(targetConversationId, 'Gateway Chat');
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
      const existingByContent = getMessageByContent(msg.role, msg.content);
      if (existingByContent) {
        // Return the existing DB ID instead of the gateway ID
        idMap[msg.id] = existingByContent.id;
        console.log('[History Sync] Found existing message by content, mapping', msg.id, '->', existingByContent.id);
        continue;
      }
      
      // Save new message to DB with the gateway ID
      try {
        addMessage(
          msg.id,
          targetConversationId,
          msg.role || 'assistant',
          msg.content || '',
          msg.images
        );
        idMap[msg.id] = msg.id;
        console.log('[History Sync] Saved new message:', msg.id);
      } catch (e) {
        // Might be duplicate key, try to find by content
        const fallback = getMessageByContent(msg.role, msg.content);
        if (fallback) {
          idMap[msg.id] = fallback.id;
        }
        console.warn('[History Sync] Could not save message:', msg.id, e);
      }
    }
    
    return json({ ok: true, idMap, saved: Object.keys(idMap).length });
  } catch (error) {
    console.error('[History Sync] Error:', error);
    return json({ 
      ok: false, 
      error: error instanceof Error ? error.message : 'Sync failed' 
    }, { status: 500 });
  }
};
