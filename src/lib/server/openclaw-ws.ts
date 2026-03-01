import { env } from '$env/dynamic/private';
import WebSocket from 'ws';

const GATEWAY_URL = env.OPENCLAW_WS_URL || 'wss://192.168.0.155:18789';
const GATEWAY_TOKEN = env.OPENCLAW_TOKEN || '5239a6586070529b6e4973bcd58c3de5';

interface ChatEvent {
  type: string;
  text?: string;
  done?: boolean;
  error?: string;
  runId?: string;
  status?: string;
}

interface WSMessage {
  id?: string;
  method?: string;
  result?: unknown;
  error?: { message: string };
  params?: ChatEvent;
}

export interface StreamEvent {
  type: 'start' | 'delta' | 'done' | 'error';
  messageId?: string;
  content?: string;
  error?: string;
}

// Send a message to the main Donki session via WebSocket
export async function* sendToMainSession(message: string): AsyncGenerator<StreamEvent> {
  const messageId = crypto.randomUUID();
  
  return yield* new Promise<AsyncGenerator<StreamEvent>>((resolve) => {
    const events: StreamEvent[] = [];
    let eventIndex = 0;
    let isDone = false;
    
    const ws = new WebSocket(GATEWAY_URL, {
      rejectUnauthorized: false, // Allow self-signed certs
    });
    
    ws.on('open', () => {
      // Send connect with auth
      ws.send(JSON.stringify({
        id: 'connect',
        method: 'connect',
        params: {
          auth: { token: GATEWAY_TOKEN },
          client: { name: 'donki-chat', version: '1.0.0' }
        }
      }));
    });
    
    ws.on('message', (data: Buffer) => {
      try {
        const msg: WSMessage = JSON.parse(data.toString());
        
        // Handle connect response
        if (msg.id === 'connect' && msg.result) {
          // Connected! Now send the chat message
          ws.send(JSON.stringify({
            id: messageId,
            method: 'chat.send',
            params: {
              text: message,
              sessionKey: 'agent:main:main'
            }
          }));
          events.push({ type: 'start', messageId });
        }
        
        // Handle chat.send response
        if (msg.id === messageId && msg.result) {
          // Message accepted, waiting for streaming response
        }
        
        // Handle streaming chat events
        if (msg.method === 'chat' && msg.params) {
          const chatEvent = msg.params;
          
          if (chatEvent.text) {
            events.push({ type: 'delta', content: chatEvent.text });
          }
          
          if (chatEvent.done) {
            events.push({ type: 'done', messageId });
            isDone = true;
            ws.close();
          }
          
          if (chatEvent.error) {
            events.push({ type: 'error', error: chatEvent.error });
            isDone = true;
            ws.close();
          }
        }
        
        // Handle errors
        if (msg.error) {
          events.push({ type: 'error', error: msg.error.message });
          isDone = true;
          ws.close();
        }
      } catch (e) {
        console.error('WS message parse error:', e);
      }
    });
    
    ws.on('error', (error) => {
      events.push({ type: 'error', error: error.message });
      isDone = true;
    });
    
    ws.on('close', () => {
      if (!isDone) {
        events.push({ type: 'done', messageId });
      }
      isDone = true;
    });
    
    // Return an async generator that yields events as they come
    resolve((async function* () {
      while (!isDone || eventIndex < events.length) {
        if (eventIndex < events.length) {
          yield events[eventIndex++];
        } else {
          // Wait a bit for more events
          await new Promise(r => setTimeout(r, 50));
        }
      }
    })());
  });
}

// Simple non-streaming version
export async function chatWithMainSession(message: string): Promise<string> {
  return new Promise((resolve, reject) => {
    let fullResponse = '';
    
    const ws = new WebSocket(GATEWAY_URL, {
      rejectUnauthorized: false,
    });
    
    const messageId = crypto.randomUUID();
    let connected = false;
    
    const timeout = setTimeout(() => {
      ws.close();
      reject(new Error('Timeout waiting for response'));
    }, 60000);
    
    ws.on('open', () => {
      ws.send(JSON.stringify({
        id: 'connect',
        method: 'connect',
        params: {
          auth: { token: GATEWAY_TOKEN },
          client: { name: 'donki-chat', version: '1.0.0' }
        }
      }));
    });
    
    ws.on('message', (data: Buffer) => {
      try {
        const msg: WSMessage = JSON.parse(data.toString());
        
        if (msg.id === 'connect' && msg.result) {
          connected = true;
          ws.send(JSON.stringify({
            id: messageId,
            method: 'chat.send',
            params: {
              text: message,
              sessionKey: 'agent:main:main'
            }
          }));
        }
        
        if (msg.method === 'chat' && msg.params) {
          if (msg.params.text) {
            fullResponse += msg.params.text;
          }
          if (msg.params.done) {
            clearTimeout(timeout);
            ws.close();
            resolve(fullResponse);
          }
          if (msg.params.error) {
            clearTimeout(timeout);
            ws.close();
            reject(new Error(msg.params.error));
          }
        }
        
        if (msg.error) {
          clearTimeout(timeout);
          ws.close();
          reject(new Error(msg.error.message));
        }
      } catch (e) {
        console.error('Parse error:', e);
      }
    });
    
    ws.on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}
