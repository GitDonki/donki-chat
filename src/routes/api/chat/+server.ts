import type { RequestHandler } from './$types';
import { v4 as uuid } from 'uuid';
import { gateway } from '$lib/server/gateway-ws';
import { 
  createConversation, 
  getConversation, 
  addMessage, 
  getMessages,
  updateConversationTitle
} from '$lib/server/db';

export const POST: RequestHandler = async ({ request }) => {
  try {
    const { message, images, conversationId } = await request.json();
    
    if (!message && (!images || images.length === 0)) {
      return new Response(JSON.stringify({ error: 'Message or images required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Ensure conversation exists
    let conversation = getConversation(conversationId);
    if (!conversation) {
      createConversation(conversationId, 'Neuer Chat');
    }
    
    // Save user message
    const userMessageId = uuid();
    addMessage(userMessageId, conversationId, 'user', message, images);
    
    // Get conversation history for title update check
    const history = getMessages(conversationId) as Array<{ role: string; content: string }>;
    
    // Create SSE stream
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        let fullResponse = '';
        const chatMessageId = uuid();
        
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'start', messageId: chatMessageId })}\n\n`));
          
          // Keep-alive heartbeat every 10 seconds to prevent timeout
          const heartbeat = setInterval(() => {
            try {
              controller.enqueue(encoder.encode(`: heartbeat\n\n`));
            } catch {
              clearInterval(heartbeat);
            }
          }, 10000);
          
          // Ensure gateway connection
          if (!gateway.isConnected()) {
            console.log('[Chat] Connecting to gateway...');
            await gateway.connect();
          }
          
          // Set up listener for chat events BEFORE sending
          let runId: string | null = null;
          let resolved = false;
          
          const chatHandler = async (payload: any) => {
            // Skip if already resolved or controller closed
            if (resolved) return;
            
            console.log('[ChatHandler] Event received:', JSON.stringify(payload).slice(0, 200));
            
            // Match by runId or sessionKey
            if (payload.runId && runId && payload.runId !== runId) {
              console.log('[ChatHandler] Skipping - runId mismatch:', payload.runId, 'vs', runId);
              return;
            }
            
            // Handle different event types
            if (payload.delta) {
              console.log('[ChatHandler] Delta:', payload.delta.slice(0, 50));
              fullResponse += payload.delta;
              try {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'delta', content: payload.delta })}\n\n`));
              } catch { /* controller closed */ }
            }
            
            if (payload.state === 'final' || payload.status === 'complete' || payload.done) {
              if (resolved) return; // Double-check
              resolved = true;
              clearInterval(heartbeat);
              gateway.removeListener('chat', chatHandler);
              console.log('[ChatHandler] Complete! Fetching history...');
              
              try {
                // Fetch history to get the actual response (like Control UI does)
                const historyMessages = await gateway.getHistory(5);
                console.log('[ChatHandler] Got history:', historyMessages.length, 'messages');
                
                // Find the last assistant message
                const lastAssistant = [...historyMessages].reverse().find((m: any) => 
                  m.role === 'assistant'
                );
                
                if (lastAssistant && !fullResponse) {
                  // Extract text content
                  const content = lastAssistant.content;
                  let text = '';
                  if (typeof content === 'string') {
                    text = content;
                  } else if (Array.isArray(content)) {
                    text = content
                      .filter((c: any) => c.type === 'text')
                      .map((c: any) => c.text)
                      .join('\n');
                  }
                  
                  if (text) {
                    fullResponse = text;
                    try {
                      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'delta', content: text })}\n\n`));
                    } catch { /* controller closed */ }
                  }
                }
              } catch (histErr) {
                console.error('[ChatHandler] History fetch failed:', histErr);
              }
              
              // Filter out NO_REPLY and other meta responses
              const isMetaResponse = fullResponse.trim() === 'NO_REPLY' || 
                                     fullResponse.trim() === 'HEARTBEAT_OK' ||
                                     fullResponse.trim().startsWith('NO_REPLY');
              
              // Save assistant message (skip meta responses)
              if (!isMetaResponse && fullResponse.trim()) {
                const assistantMessageId = uuid();
                addMessage(assistantMessageId, conversationId, 'assistant', fullResponse);
              }
              
              // Update conversation title if first exchange
              if (history.length <= 1 && message) {
                const title = message.length > 50 ? message.substring(0, 47) + '...' : message;
                updateConversationTitle(conversationId, title);
              }
              
              // Safe close - signal if it was a no-reply
              try {
                if (isMetaResponse) {
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'no-reply' })}\n\n`));
                } else {
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'done', messageId: chatMessageId })}\n\n`));
                }
                controller.enqueue(encoder.encode('data: [DONE]\n\n'));
                controller.close();
              } catch (closeErr) {
                console.log('[ChatHandler] Controller already closed');
              }
            }
            
            if (payload.error) {
              if (resolved) return;
              resolved = true;
              clearInterval(heartbeat);
              gateway.removeListener('chat', chatHandler);
              try {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'error', error: payload.error })}\n\n`));
                controller.enqueue(encoder.encode('data: [DONE]\n\n'));
                controller.close();
              } catch (closeErr) {
                console.log('[ChatHandler] Controller already closed');
              }
            }
          };
          
          gateway.on('chat', chatHandler);
          
          // Send message to main session
          console.log('[Chat] Sending message to main session:', message.slice(0, 50));
          const result = await gateway.sendMessage(message);
          runId = result.runId;
          console.log('[Chat] Got runId:', runId);
          
          // Timeout after 2 minutes
          setTimeout(() => {
            if (!resolved) {
              resolved = true;
              clearInterval(heartbeat);
              gateway.removeListener('chat', chatHandler);
              
              if (fullResponse) {
                // Save partial response
                const assistantMessageId = uuid();
                addMessage(assistantMessageId, conversationId, 'assistant', fullResponse);
              }
              
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'error', error: 'Timeout' })}\n\n`));
              controller.enqueue(encoder.encode('data: [DONE]\n\n'));
              controller.close();
            }
          }, 120000);
          
        } catch (error) {
          console.error('[Chat] Error:', error);
          const errorMsg = error instanceof Error ? error.message : 'Unknown error';
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'error', error: errorMsg })}\n\n`));
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        }
      }
    });
    
    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      }
    });
    
  } catch (error) {
    console.error('Chat error:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Chat failed' 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
