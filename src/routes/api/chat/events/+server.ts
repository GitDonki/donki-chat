import type { RequestHandler } from './$types';
import { gateway } from '$lib/server/gateway-ws';
import { TEAM_AGENTS } from '$lib/server/db';

// SSE endpoint for real-time chat events from the gateway
// Supports filtering by agent via ?agent=nabu query parameter
export const GET: RequestHandler = async ({ request, url }) => {
  const agentId = url.searchParams.get('agent') || 'main';
  
  // Validate agent
  const agent = TEAM_AGENTS.find(a => a.id === agentId);
  if (!agent) {
    return new Response(JSON.stringify({ error: 'Agent not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  const sessionKeyPrefix = `agent:${agentId}:`;
  
  // Ensure gateway is connected
  if (!gateway.isConnected()) {
    try {
      await gateway.connect();
    } catch (e) {
      console.error('[ChatEvents] Gateway connection failed:', e);
    }
  }

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      
      // Send initial connected event
      try {
        const initData = JSON.stringify({ type: 'connected', agentId, sessionKey: agent.sessionKey });
        controller.enqueue(encoder.encode(`data: ${initData}\n\n`));
      } catch {
        // Stream already closed
      }
      
      // Send keepalive ping every 30s
      const keepalive = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': keepalive\n\n'));
        } catch {
          // Stream closed
          clearInterval(keepalive);
        }
      }, 30000);

      // Listen for chat events from gateway
      const onChat = (payload: unknown) => {
        try {
          const p = payload as any;
          
          // Filter events by session key if present
          // Events may have sessionKey directly or nested in message
          const eventSessionKey = p.sessionKey || p.message?.sessionKey || '';
          
          // If event has a session key, filter by agent
          // Events without session key (like deltas) are passed through
          if (eventSessionKey && !eventSessionKey.startsWith(sessionKeyPrefix)) {
            // Event is for a different agent, skip
            return;
          }
          
          const data = JSON.stringify({ type: 'chat', payload, agentId });
          controller.enqueue(encoder.encode(`data: ${data}\n\n`));
        } catch (e) {
          console.error('[ChatEvents] Error sending event:', e);
        }
      };

      gateway.on('chat', onChat);

      // Cleanup on close
      request.signal.addEventListener('abort', () => {
        clearInterval(keepalive);
        gateway.off('chat', onChat);
        try {
          controller.close();
        } catch {
          // Already closed
        }
      });
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Agent-Id': agentId
    }
  });
};
