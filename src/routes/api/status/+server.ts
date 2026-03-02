import type { RequestHandler } from './$types';
import { gateway } from '$lib/server/gateway-ws';

export const GET: RequestHandler = async ({ url }) => {
  try {
    const agentId = url.searchParams.get('agentId') || 'main';
    const sessionKey = `agent:${agentId}:main`;
    
    // Ensure gateway connection
    if (!gateway.isConnected()) {
      await gateway.connect();
    }
    
    // Get session status from gateway
    const status = await gateway.getSessionStatus(sessionKey);
    
    return new Response(JSON.stringify(status), {
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('[Status API] Error:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Failed to get status' 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
