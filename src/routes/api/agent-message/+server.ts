import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { addMessage, getConversation, createConversation, TEAM_AGENTS } from '$lib/server/db';
import { v4 as uuid } from 'uuid';

/**
 * POST /api/agent-message
 * Allows agents to post messages directly as themselves (assistant role)
 * 
 * Body: { agentId: string, message: string }
 */
export const POST: RequestHandler = async ({ request }) => {
  try {
    const { agentId, message } = await request.json();
    
    if (!agentId || !message) {
      return json({ ok: false, error: 'agentId and message required' }, { status: 400 });
    }
    
    // Validate agent
    const agent = TEAM_AGENTS.find(a => a.id === agentId);
    if (!agent) {
      return json({ ok: false, error: 'Agent not found' }, { status: 404 });
    }
    
    const conversationId = `conv_${agentId}`;
    
    // Ensure conversation exists
    if (!getConversation(conversationId)) {
      createConversation(conversationId, `Chat mit ${agent.name}`);
    }
    
    // Add message as assistant
    const messageId = uuid();
    addMessage(messageId, conversationId, 'assistant', message);
    
    console.log(`[AgentMessage] ${agent.name} posted message:`, message.slice(0, 50));
    
    return json({ 
      ok: true, 
      messageId,
      agentId,
      agentName: agent.name
    });
    
  } catch (error) {
    console.error('[AgentMessage] Error:', error);
    return json({ 
      ok: false, 
      error: error instanceof Error ? error.message : 'Failed to post message' 
    }, { status: 500 });
  }
};
