import type { RequestHandler } from './$types';
import { toggleReaction } from '$lib/server/db';
import { gateway } from '$lib/server/gateway-ws';

export const POST: RequestHandler = async ({ request }) => {
  try {
    const { messageId, emoji } = await request.json();
    
    if (!messageId || !emoji) {
      return new Response(JSON.stringify({ error: 'messageId and emoji required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // 1. Toggle reaction in local DB
    const reactions = toggleReaction(messageId, emoji);
    
    // 2. Send reaction to Gateway via WebSocket (fire and forget)
    try {
      if (gateway.isConnected()) {
        gateway.sendReaction(messageId, emoji);
        console.log('[Reactions] Sent to gateway:', messageId, emoji);
      }
    } catch (gwErr) {
      // Don't fail the request if gateway send fails
      console.warn('[Reactions] Gateway send failed:', gwErr);
    }
    
    return new Response(JSON.stringify({ reactions }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Reaction error:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Reaction failed' 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
