import WebSocket from 'ws';
import { EventEmitter } from 'events';

const GATEWAY_URL = process.env.OPENCLAW_WS_URL || 'wss://192.168.0.155:18789';
const GATEWAY_TOKEN = process.env.OPENCLAW_TOKEN || '5239a6586070529b6e4973bcd58c3de5';
const DEFAULT_SESSION_KEY = 'agent:main:main';

interface GatewayMessage {
  type: 'req' | 'res' | 'event';
  id?: string;
  method?: string;
  params?: Record<string, unknown>;
  ok?: boolean;
  payload?: unknown;
  error?: string;
  event?: string;
}

// Attachment format for chat.send (OpenClaw Gateway format)
export interface ImageAttachment {
  type: 'image';
  mimeType: string;
  content: string;  // base64 without data: prefix
}

class GatewayConnection extends EventEmitter {
  private ws: WebSocket | null = null;
  private connected = false;
  private requestId = 0;
  private pendingRequests = new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  private reconnectTimer: NodeJS.Timeout | null = null;

  async connect(): Promise<void> {
    if (this.connected) return;

    return new Promise((resolve, reject) => {
      console.log('[Gateway] Connecting to', GATEWAY_URL);
      
      this.ws = new WebSocket(GATEWAY_URL, {
        rejectUnauthorized: false,
        headers: {
          'Origin': 'https://chat.opendonki.de'
        }
      });

      const timeout = setTimeout(() => {
        reject(new Error('Connection timeout'));
        this.ws?.close();
      }, 10000);

      this.ws.on('open', () => {
        console.log('[Gateway] WebSocket open, waiting for challenge...');
      });

      this.ws.on('message', async (data) => {
        try {
          const msg: GatewayMessage = JSON.parse(data.toString());
          
          // Handle connect challenge
          if (msg.type === 'event' && msg.event === 'connect.challenge') {
            console.log('[Gateway] Got challenge, sending connect...');
            this.sendRaw({
              type: 'req',
              id: 'connect-1',
              method: 'connect',
              params: {
                minProtocol: 3,
                maxProtocol: 3,
                client: {
                  id: 'webchat-ui',
                  version: '1.0.0',
                  platform: 'linux',
                  mode: 'webchat'
                },
                role: 'operator',
                scopes: ['operator.read', 'operator.write', 'operator.admin'],
                caps: [],
                commands: [],
                permissions: {},
                auth: { token: GATEWAY_TOKEN },
                locale: 'de-DE',
                userAgent: 'donki-chat/1.0.0'
                // NO device identity - using allowInsecureAuth
              }
            });
          }
          
          // Handle connect response
          if (msg.type === 'res' && msg.id === 'connect-1') {
            clearTimeout(timeout);
            if (msg.ok) {
              console.log('[Gateway] Connected successfully!');
              this.connected = true;
              resolve();
            } else {
              const errorMsg = typeof msg.error === 'string' ? msg.error : 
                (msg.error as any)?.message || JSON.stringify(msg.error) || 'Connect failed';
              console.error('[Gateway] Connect failed:', errorMsg);
              reject(new Error(errorMsg));
            }
          }
          
          // Log ALL events for debugging
          if (msg.type === 'event') {
            console.log('[Gateway] Event:', msg.event, JSON.stringify(msg.payload).slice(0, 300));
          }
          
          // Handle chat events (responses from agent)
          if (msg.type === 'event' && msg.event === 'chat') {
            this.emit('chat', msg.payload);
          }
          
          // Handle other responses
          if (msg.type === 'res' && msg.id && msg.id !== 'connect-1') {
            console.log('[Gateway] Response for', msg.id, '- ok:', msg.ok);
            const pending = this.pendingRequests.get(msg.id);
            if (pending) {
              this.pendingRequests.delete(msg.id);
              if (msg.ok) {
                console.log('[Gateway] Payload:', JSON.stringify(msg.payload).slice(0, 200));
                pending.resolve(msg.payload);
              } else {
                console.log('[Gateway] Error object:', JSON.stringify(msg.error));
                const errorMsg = typeof msg.error === 'string' ? msg.error :
                  (msg.error as any)?.message || JSON.stringify(msg.error) || 'Request failed';
                pending.reject(new Error(errorMsg));
              }
            }
          }
          
        } catch (e) {
          console.error('[Gateway] Parse error:', e);
        }
      });

      this.ws.on('error', (err) => {
        console.error('[Gateway] WebSocket error:', err.message);
        reject(err);
      });

      this.ws.on('close', (code, reason) => {
        console.log('[Gateway] WebSocket closed:', code, reason.toString());
        this.connected = false;
        this.ws = null;
        
        // Auto-reconnect after 5s
        if (!this.reconnectTimer) {
          this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            this.connect().catch(console.error);
          }, 5000);
        }
      });
    });
  }

  private sendRaw(msg: GatewayMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  private async request(method: string, params: Record<string, unknown>): Promise<unknown> {
    if (!this.connected) {
      await this.connect();
    }

    const id = `req-${++this.requestId}`;
    
    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });
      
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error('Request timeout'));
        }
      }, 60000);

      this.sendRaw({ type: 'req', id, method, params });
    });
  }

  async sendMessage(message: string, attachments?: ImageAttachment[], agentId?: string): Promise<{ runId: string }> {
    const sessionKey = agentId ? `agent:${agentId}:main` : DEFAULT_SESSION_KEY;
    const idempotencyKey = `chat-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const params: Record<string, unknown> = {
      sessionKey,
      message,
      idempotencyKey,
      deliver: false
    };
    
    // Add attachments if present
    if (attachments && attachments.length > 0) {
      params.attachments = attachments;
    }
    
    console.log('[Gateway] Sending message to session:', sessionKey);
    const result = await this.request('chat.send', params);
    return result as { runId: string };
  }

  async getHistory(limit = 50, agentId?: string): Promise<unknown[]> {
    const sessionKey = agentId ? `agent:${agentId}:main` : DEFAULT_SESSION_KEY;
    const result = await this.request('chat.history', {
      sessionKey,
      limit
    });
    return (result as { messages: unknown[] }).messages || [];
  }

  /**
   * Get health/status info from gateway
   */
  async getStatus(): Promise<unknown> {
    const result = await this.request('health', {});
    return result;
  }

  /**
   * Get session info from sessions.list filtered by sessionKey
   */
  async getSessionStatus(sessionKey: string): Promise<unknown> {
    const result = await this.request('sessions.list', { 
      activeMinutes: 0,  // Include all
      limit: 100
    }) as { sessions?: Array<{ key: string; model?: string; startedAt?: number; usage?: { inputTokens?: number; outputTokens?: number }; cost?: number; turnCount?: number }> };
    
    // Find matching session
    const sessions = result.sessions || [];
    const session = sessions.find(s => s.key === sessionKey);
    
    if (!session) {
      return { error: 'Session not found' };
    }
    
    return {
      model: session.model,
      sessionStart: session.startedAt ? new Date(session.startedAt).toISOString() : undefined,
      inputTokens: session.usage?.inputTokens,
      outputTokens: session.usage?.outputTokens,
      totalTokens: (session.usage?.inputTokens || 0) + (session.usage?.outputTokens || 0),
      cost: session.cost,
      turnCount: session.turnCount
    };
  }

  /**
   * Send a reaction event to the gateway
   * Format: { type: "reaction", messageId: "...", emoji: "👍" }
   */
  sendReaction(messageId: string, emoji: string, agentId?: string): void {
    if (!this.connected || !this.ws) {
      console.warn('[Gateway] Cannot send reaction - not connected');
      return;
    }
    
    const sessionKey = agentId ? `agent:${agentId}:main` : DEFAULT_SESSION_KEY;
    
    // Send as an event (fire and forget, no response expected)
    this.sendRaw({
      type: 'event',
      event: 'reaction',
      payload: {
        type: 'reaction',
        messageId,
        emoji,
        sessionKey,
        timestamp: Date.now()
      }
    } as any);
    
    console.log('[Gateway] Sent reaction:', messageId, emoji);
  }

  isConnected(): boolean {
    return this.connected;
  }

  close(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close();
  }
}

// Singleton instance
export const gateway = new GatewayConnection();
