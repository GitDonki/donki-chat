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
      
      // Skip meta responses, system notifications, and raw exec output
      const trimmed = content.trim();
      if (trimmed === 'NO_REPLY' || trimmed === 'HEARTBEAT_OK') continue;
      if (trimmed.startsWith('System: [')) continue;
      if (trimmed.startsWith('sent ') && trimmed.includes('bytes')) continue;
      if (trimmed.startsWith('[main ') && (trimmed.includes('fix:') || trimmed.includes('feat:'))) continue;
      if (trimmed.startsWith('sha256:')) continue;
      if (trimmed.startsWith('DEPRECATED:')) continue;
      if (trimmed.match(/^[a-f0-9]{64}$/)) continue;
      
      // CRITICAL: Messages without ID must be rejected or saved to DB first
      // Do NOT generate random IDs - causes reaction ID mismatch!
      if (!msg.id) {
        console.warn('[SSE Sync] Message without ID, will save to DB first:', content.slice(0, 50));
      }
      
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
      
      // Sync to DB FIRST to get stable IDs
      const syncResponse = await fetch('/api/chat/history', {
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
      
      const syncData = await syncResponse.json();
      const idMap: Record<string, string> = syncData.idMap || {};
      
      console.log('[SSE] Synced missing messages to DB, idMap:', idMap);
      
      // Update message IDs with DB IDs (if they were remapped)
      const messagesWithCorrectIds = missingMessages.map(m => {
        const dbId = idMap[m.id];
        if (dbId && dbId !== m.id) {
          console.log('[SSE] Remapping ID:', m.id, '->', dbId);
          return { ...m, id: dbId };
        }
        return m;
      });
      
      // Sort by timestamp and add to store
      messagesWithCorrectIds.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
      
      for (const msg of messagesWithCorrectIds) {
        messages.addMessage(msg);
      }
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
    
    // ===== SYSTEM MESSAGE FILTERS (same as in loadAgentHistory) =====
    const trimmed = content.trim();
    
    // Skip system notifications and raw exec output
    if (trimmed.startsWith('System: [')) {
      console.log('[SSE] Filtered: System notification');
      return;
    }
    if (trimmed.startsWith('sent ') && trimmed.includes('bytes')) {
      console.log('[SSE] Filtered: rsync output');
      return;
    }
    if (trimmed.startsWith('[main ') && (trimmed.includes('fix:') || trimmed.includes('feat:'))) {
      console.log('[SSE] Filtered: git commit');
      return;
    }
    if (trimmed.startsWith('sha256:')) {
      console.log('[SSE] Filtered: docker hash');
      return;
    }
    if (trimmed.startsWith('DEPRECATED:')) {
      console.log('[SSE] Filtered: deprecation warning');
      return;
    }
    if (trimmed.match(/^[a-f0-9]{64}$/)) {
      console.log('[SSE] Filtered: container ID');
      return;
    }
    if (trimmed === 'NO_REPLY' || trimmed === 'HEARTBEAT_OK') {
      console.log('[SSE] Filtered: meta response');
      return;
    }
    // ===== END FILTERS =====
    
    // Check for duplicates by content hash
    const currentMessages = get(messages);
    const contentPrefix = `assistant:${content.slice(0, 100)}`;
    const exists = currentMessages.some(m => 
      m.role === 'assistant' && `${m.role}:${m.content.slice(0, 100)}` === contentPrefix
    );
    
    if (!exists) {
      const tempId = msg.id || payload.runId || `sse-${hashContent('assistant:' + content)}`;
      
      // CRITICAL: Messages without proper ID need DB sync FIRST to get stable ID
      if (!msg.id) {
        console.warn('[SSE Event] Message without ID, saving to DB first');
      }
      
      // Also check for ID collision
      const idExists = currentMessages.some(m => m.id === tempId);
      if (idExists) {
        console.warn('[SSE] Skipping message with duplicate ID:', tempId);
        return;
      }
      
      // Sync to DB FIRST to get stable ID
      fetch('/api/chat/history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          messages: [{ id: tempId, role: 'assistant', content }],
          agentId
        })
      })
        .then(res => res.json())
        .then(data => {
          const idMap: Record<string, string> = data.idMap || {};
          const finalId = idMap[tempId] || tempId;
          
          if (finalId !== tempId) {
            console.log('[SSE] Remapped message ID:', tempId, '->', finalId);
          }
          
          const newMessage: ChatMessage = {
            id: finalId,
            role: 'assistant',
            content,
            createdAt: new Date(msg.timestamp || payload.ts || Date.now()),
            isStreaming: false
          };
          
          // Check again for ID collision with final ID
          const currentMessages = get(messages);
          const finalIdExists = currentMessages.some(m => m.id === finalId);
          if (!finalIdExists) {
            messages.addMessage(newMessage);
            console.log('[SSE] Added message from other channel for', agentId, 'with ID:', finalId);
          }
        })
        .catch(e => console.warn('[SSE] DB sync failed:', e));
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
// NOTE: Only use SSE for 'main' agent. Other agents use polling (agent-sync.ts)
selectedAgentId.subscribe(agentId => {
  if (agentId && typeof window !== 'undefined') {
    // Only connect SSE for main agent
    if (agentId === 'main') {
      connectSSE(agentId);
    } else {
      // Disconnect SSE for non-main agents (they use polling)
      disconnectSSE();
    }
  }
});
