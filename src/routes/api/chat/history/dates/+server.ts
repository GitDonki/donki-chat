import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getMessageDates, TEAM_AGENTS } from '$lib/server/db';

export const GET: RequestHandler = async ({ url }) => {
  const agentId = url.searchParams.get('agent') || 'main';
  
  // Validate agent
  const agent = TEAM_AGENTS.find(a => a.id === agentId);
  if (!agent) {
    return json({ ok: false, error: 'Agent not found' }, { status: 404 });
  }
  
  try {
    const conversationId = `conv_${agentId}`;
    const dates = getMessageDates(conversationId);
    
    return json({
      ok: true,
      agentId,
      dates
    });
  } catch (error) {
    console.error('[History Dates] Error:', error);
    return json({ 
      ok: false, 
      error: error instanceof Error ? error.message : 'Failed to fetch dates',
      dates: []
    }, { status: 500 });
  }
};
