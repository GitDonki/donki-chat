import type { RequestHandler } from './$types';
import { v4 as uuid } from 'uuid';
import { gateway, type ImageAttachment } from '$lib/server/gateway-ws';
import { 
  createConversation, 
  getConversation, 
  addMessage, 
  getMessages,
  updateConversationTitle,
  TEAM_AGENTS,
  getAgentById
} from '$lib/server/db';
import { getUploadAsBase64 } from '$lib/server/upload';

export const POST: RequestHandler = async ({ request }) => {
  try {
    const { message, images, conversationId, agentId = 'main', userMessageId: clientUserMsgId, assistantMessageId: clientAssistantMsgId } = await request.json();
    
    // Validate agent
    const agent = getAgentById(agentId);
    if (!agent) {
      return new Response(JSON.stringify({ error: 'Agent not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Use agent's dedicated conversation if no conversationId provided
    const targetConversationId = conversationId || `conv_${agentId}`;
    
    if (!message && (!images || images.length === 0)) {
      return new Response(JSON.stringify({ error: 'Message or images required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Ensure conversation exists
    let conversation = getConversation(targetConversationId);
    if (!conversation) {
      createConversation(targetConversationId, `Chat mit ${agent.name}`);
    }
    
    // Use client-provided IDs if available (for reaction support), otherwise generate
    const userMessageId = clientUserMsgId || uuid();
    addMessage(userMessageId, targetConversationId, 'user', message, images);
    
    // Get conversation history for title update check
    const history = getMessages(targetConversationId) as Array<{ role: string; content: string }>;
    
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
          let lastKnownText = ''; // Track cumulative text to compute deltas
          
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
            // Gateway sends cumulative text in message.content, not incremental deltas
            // We need to compute the delta ourselves
            let delta = '';
            
            if (payload.message?.content) {
              // Extract text from content array
              const content = payload.message.content;
              let currentText = '';
              if (Array.isArray(content)) {
                currentText = content
                  .filter((c: any) => c.type === 'text')
                  .map((c: any) => c.text || '')
                  .join('');
              } else if (typeof content === 'string') {
                currentText = content;
              }
              
              // Compute delta: what's new since last known text
              if (currentText.startsWith(lastKnownText)) {
                // Normal case: text was appended
                delta = currentText.slice(lastKnownText.length);
              } else if (currentText.length > 0) {
                // Text was replaced/reset (happens after tool calls)
                // Append the new text with a separator
                if (lastKnownText.length > 0) {
                  console.log('[ChatHandler] Text reset detected, appending new segment');
                  delta = '\n\n' + currentText;
                } else {
                  delta = currentText;
                }
              }
              
              if (delta) {
                lastKnownText = currentText;
              }
            } else if (payload.delta) {
              // Fallback: direct delta field (some events have this)
              delta = payload.delta;
              lastKnownText += delta;
            }
            
            if (delta) {
              console.log('[ChatHandler] Delta:', delta.slice(0, 50));
              fullResponse += delta;
              try {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'delta', content: delta })}\n\n`));
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
                ) as { role: string; content: string | Array<{ type: string; text: string }> } | undefined;
                
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
              // Use client-provided ID so frontend reactions work correctly
              if (!isMetaResponse && fullResponse.trim()) {
                const assistantMessageId = clientAssistantMsgId || uuid();
                addMessage(assistantMessageId, targetConversationId, 'assistant', fullResponse);
              }
              
              // Update conversation title if first exchange (skip for agent conversations)
              if (history.length <= 1 && message && !targetConversationId.startsWith('conv_')) {
                const title = message.length > 50 ? message.substring(0, 47) + '...' : message;
                updateConversationTitle(targetConversationId, title);
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
          
          // Build attachments if images present
          let attachments: ImageAttachment[] | undefined;
          
          if (images && images.length > 0) {
            console.log('[Chat] Building attachments with', images.length, 'images');
            attachments = [];
            
            for (const imageId of images) {
              const imageData = await getUploadAsBase64(imageId);
              if (imageData) {
                console.log('[Chat] Adding image:', imageId, imageData.mimeType);
                attachments.push({
                  type: 'image',
                  mimeType: imageData.mimeType,
                  content: imageData.base64  // base64 without data: prefix
                });
              } else {
                console.warn('[Chat] Image not found:', imageId);
              }
            }
          }
          
          // Send message to agent session
          const msgPreview = message ? message.slice(0, 50) : '(no text)';
          const attachmentInfo = attachments ? ` + ${attachments.length} images` : '';
          console.log(`[Chat] Sending message to ${agent.name} (${agentId}):`, msgPreview + attachmentInfo);
          const result = await gateway.sendMessage(message || '', attachments, agentId);
          runId = result.runId;
          console.log('[Chat] Got runId:', runId);
          
          // Send runId to client so it can filter SSE events
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'runId', runId })}\n\n`));
          
          // Timeout after 10 minutes (long operations like docker builds)
          setTimeout(() => {
            if (!resolved) {
              resolved = true;
              clearInterval(heartbeat);
              gateway.removeListener('chat', chatHandler);
              
              if (fullResponse) {
                // Save partial response - use client-provided ID for reaction support
                const assistantMessageId = clientAssistantMsgId || uuid();
                addMessage(assistantMessageId, targetConversationId, 'assistant', fullResponse);
              }
              
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'error', error: 'Timeout' })}\n\n`));
              controller.enqueue(encoder.encode('data: [DONE]\n\n'));
              controller.close();
            }
          }, 600000);
          
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
