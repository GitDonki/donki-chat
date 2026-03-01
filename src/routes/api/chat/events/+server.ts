import type { RequestHandler } from './$types';
import { gateway } from '$lib/server/gateway-ws';

// SSE endpoint for real-time chat events from the gateway
// This allows the UI to receive messages that Donki sends in other channels
export const GET: RequestHandler = async ({ request }) => {
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
          const data = JSON.stringify({ type: 'chat', payload });
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
      'Connection': 'keep-alive'
    }
  });
};
