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
  // Skip events from our own sends
  if (payload.runId && localRunIds.has(payload.runId)) {
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
