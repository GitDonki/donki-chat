import { env } from '$env/dynamic/private';
import WebSocket from 'ws';

export interface StreamEvent {
  type: 'start' | 'delta' | 'done' | 'error';
  messageId?: string;
  content?: string;
  usage?: {
    input_tokens: number;
    output_tokens: number;
  };
  error?: string;
}

const OPENCLAW_URL = env.OPENCLAW_URL || 'wss://192.168.0.155:18789';
const OPENCLAW_TOKEN = env.OPENCLAW_TOKEN || '';

export async function* streamChat(
  message: string,
  sessionKey?: string
): AsyncGenerator<StreamEvent> {
  const messageId = crypto.randomUUID();
  
  yield { type: 'start', messageId };
  
  try {
    // Connect to OpenClaw gateway WebSocket
    const wsUrl = `${OPENCLAW_URL}/ws?token=${OPENCLAW_TOKEN}`;
    
    const response = await fetch(`${OPENCLAW_URL.replace('wss:', 'https:').replace('ws:', 'http:')}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENCLAW_TOKEN}`,
      },
      body: JSON.stringify({
        message,
        sessionKey: sessionKey || 'webchat:donki-chat',
        stream: true,
      }),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenClaw API error: ${response.status} - ${errorText}`);
    }
    
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body');
    }
    
    const decoder = new TextDecoder();
    let buffer = '';
    
    while (true) {
      const { done, value } = await reader.read();
      
      if (done) break;
      
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim();
          
          if (data === '[DONE]') {
            yield { type: 'done', messageId };
            return;
          }
          
          try {
            const event = JSON.parse(data);
            
            if (event.type === 'content' || event.type === 'delta') {
              yield { type: 'delta', content: event.text || event.content || '' };
            } else if (event.type === 'error') {
              yield { type: 'error', error: event.message || event.error };
            }
          } catch (e) {
            // Non-JSON line, might be raw content
            if (data && !data.startsWith('{')) {
              yield { type: 'delta', content: data };
            }
          }
        }
      }
    }
    
    yield { type: 'done', messageId };
    
  } catch (error) {
    yield { 
      type: 'error', 
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}
