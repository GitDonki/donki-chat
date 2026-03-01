import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { gateway } from '$lib/server/gateway-ws';

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
