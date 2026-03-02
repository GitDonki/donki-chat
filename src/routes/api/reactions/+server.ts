import type { RequestHandler } from './$types';
import { toggleReaction } from '$lib/server/db';

export const POST: RequestHandler = async ({ request }) => {
  try {
    const { messageId, emoji } = await request.json();
    
    if (!messageId || !emoji) {
      return new Response(JSON.stringify({ error: 'messageId and emoji required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    const reactions = toggleReaction(messageId, emoji);
    
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
