import { writable, get } from 'svelte/store';
import { messages, type ChatMessage } from './chat';
import { selectedAgentId, updateMemberStatus } from './team';

// Current SSE connection state
export const sseConnected = writable(false);
export const sseAgentId = writable<string | null>(null);

let currentEventSource: EventSource | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let localRunIds = new Set<string>();

// Track runIds from local sends to avoid duplicates
export function trackRunId(runId: string): void {
  localRunIds.add(runId);
  // Clean up old runIds after 5 minutes
  setTimeout(() => localRunIds.delete(runId), 300000);
}

// Simple hash for content-based deduplication
function hashContent(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

// Sync missing messages from gateway on (re)connect
async function syncMissingMessages(agentId: string): Promise<void> {
  try {
    console.log('[SSE] Syncing missing messages for agent:', agentId);
    
    // Fetch recent history from gateway (source=gateway forces fresh fetch)
    const response = await fetch(`/api/chat/history?agent=${agentId}&source=gateway&limit=20`);
    if (!response.ok) return;
    
    const data = await response.json();
    if (!data.ok || !data.messages) return;
    
    const currentMessages = get(messages);
    const currentContentHashes = new Set(
      currentMessages.map(m => `${m.role}:${m.content.slice(0, 100)}`)
    );
    
    const missingMessages: ChatMessage[] = [];
    
    for (const msg of data.messages) {
      // Extract content
      let content = '';
      if (typeof msg.content === 'string') {
        content = msg.content;
      } else if (Array.isArray(msg.content)) {
        content = msg.content
          .filter((c: any) => c.type === 'text')
          .map((c: any) => c.text || '')
          .join('');
      }
      
      if (!content.trim()) continue;
      
      // Skip if already exists (content-based check)
      const contentHash = `${msg.role}:${content.slice(0, 100)}`;
      if (currentContentHashes.has(contentHash)) continue;
      
      // Skip meta responses
      if (content.trim() === 'NO_REPLY' || content.trim() === 'HEARTBEAT_OK') continue;
      
      const messageId = msg.id || `sync-${hashContent(msg.role + ':' + content)}`;
      
      missingMessages.push({
        id: messageId,
        role: msg.role,
        content,
        createdAt: new Date(msg.timestamp || Date.now()),
        isStreaming: false
      });
      
      currentContentHashes.add(contentHash);
    }
    
    if (missingMessages.length > 0) {
      console.log('[SSE] Found', missingMessages.length, 'missing messages to sync');
      
      // Sort by timestamp and add to store
      missingMessages.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
      
      for (const msg of missingMessages) {
        messages.addMessage(msg);
      }
      
      // Sync to DB
      await fetch('/api/chat/history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          messages: missingMessages.map(m => ({ 
            id: m.id, 
            role: m.role, 
            content: m.content 
          })),
          agentId
        })
      });
      
      console.log('[SSE] Synced missing messages to DB');
    } else {
      console.log('[SSE] No missing messages found');
    }
  } catch (e) {
    console.warn('[SSE] Sync failed:', e);
  }
}

// Connect to SSE for a specific agent
export function connectSSE(agentId: string): void {
  // Clear any pending reconnect
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  
  // Close existing connection
  if (currentEventSource) {
    currentEventSource.close();
    currentEventSource = null;
  }
  
  sseAgentId.set(agentId);
  sseConnected.set(false);
  
  console.log('[SSE] Connecting for agent:', agentId);
  
  currentEventSource = new EventSource(`/api/chat/events?agent=${agentId}`);
  
  currentEventSource.onopen = () => {
    console.log('[SSE] Connected for agent:', agentId);
    sseConnected.set(true);
    updateMemberStatus(agentId, 'active');
    
    // Sync any messages that arrived while disconnected
    syncMissingMessages(agentId);
  };
  
  currentEventSource.onmessage = async (event) => {
    try {
      const data = JSON.parse(event.data);
      
      if (data.type === 'connected') {
        console.log('[SSE] Received connected event for:', data.agentId);
        return;
      }
      
      if (data.type === 'chat' && data.payload) {
        handleChatEvent(data.payload, agentId);
      }
    } catch (e) {
      console.warn('[SSE] Parse error:', e);
    }
  };
  
  currentEventSource.onerror = () => {
    console.warn('[SSE] Connection error for agent:', agentId);
    sseConnected.set(false);
    
    // Reconnect after 5 seconds if still on same agent
    reconnectTimer = setTimeout(() => {
      if (get(selectedAgentId) === agentId) {
        console.log('[SSE] Reconnecting...');
        connectSSE(agentId);
      }
    }, 5000);
  };
}

// Handle incoming chat events
function handleChatEvent(payload: any, agentId: string): void {
  // Skip events from our own sends (tracked by runId)
  if (payload.runId && localRunIds.has(payload.runId)) {
    console.log('[SSE] Skipping own message by runId:', payload.runId);
    return;
  }
  
  // Skip events from the WebChat channel (that's us!)
  // SSE should only show messages from OTHER channels (Telegram, Signal, etc.)
  if (payload.channel === 'webchat' || payload.sessionKey?.includes('webchat')) {
    console.log('[SSE] Skipping webchat message');
    return;
  }
  
  const msg = payload.message || payload;
  const isFinal = payload.state === 'final';
  
  // Only process final assistant messages from other channels
  if (isFinal && msg.role === 'assistant' && msg.content) {
    const content = typeof msg.content === 'string' 
      ? msg.content 
      : Array.isArray(msg.content) 
        ? msg.content.map((c: any) => c.text || '').join('') 
        : '';
    
    if (!content.trim()) return;
    
    // Check for duplicates by content hash
    const currentMessages = get(messages);
    const contentPrefix = `assistant:${content.slice(0, 100)}`;
    const exists = currentMessages.some(m => 
      m.role === 'assistant' && `${m.role}:${m.content.slice(0, 100)}` === contentPrefix
    );
    
    if (!exists) {
      const messageId = msg.id || payload.runId || `sse-${hashContent('assistant:' + content)}`;
      
      // Also check for ID collision
      const idExists = currentMessages.some(m => m.id === messageId);
      if (idExists) {
        console.warn('[SSE] Skipping message with duplicate ID:', messageId);
        return;
      }
      
      const newMessage: ChatMessage = {
        id: messageId,
        role: 'assistant',
        content,
        createdAt: new Date(msg.timestamp || payload.ts || Date.now()),
        isStreaming: false
      };
      
      messages.addMessage(newMessage);
      console.log('[SSE] Added message from other channel for', agentId);
      
      // Sync to DB
      fetch('/api/chat/history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          messages: [{ id: messageId, role: 'assistant', content }],
          agentId
        })
      }).catch(e => console.warn('[SSE] DB sync failed:', e));
    }
  }
}

// Disconnect SSE
export function disconnectSSE(): void {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  
  if (currentEventSource) {
    console.log('[SSE] Disconnecting');
    currentEventSource.close();
    currentEventSource = null;
  }
  
  sseConnected.set(false);
  sseAgentId.set(null);
}

// Subscribe to agent changes and reconnect SSE
selectedAgentId.subscribe(agentId => {
  if (agentId && typeof window !== 'undefined') {
    connectSSE(agentId);
  }
});
