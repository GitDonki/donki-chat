import { writable, get } from 'svelte/store';
import { messages, type ChatMessage } from './chat';
import { selectedAgentId, updateMemberStatus } from './team';
import { markAgentAsSeen } from './unread';

// Polling state
export const pollingActive = writable(false);
export const lastPollTime = writable<number>(0);

// New messages detected per agent (for unread indicator)
export const newMessagesDetected = writable<Record<string, boolean>>({});

let pollTimer: ReturnType<typeof setInterval> | null = null;
let lastSeenMessageId: string | null = null;
let isPolling = false;

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

// Poll history for non-main agents
async function pollAgentHistory(agentId: string): Promise<void> {
  // Prevent concurrent polls
  if (isPolling) {
    console.log('[AgentSync] Poll already in progress, skipping');
    return;
  }
  
  isPolling = true;
  
  try {
    console.log('[AgentSync] Polling history for agent:', agentId);
    
    // Fetch recent history from gateway (source=gateway forces fresh fetch)
    const response = await fetch(`/api/chat/history?agent=${agentId}&source=gateway&limit=10`);
    if (!response.ok) {
      console.warn('[AgentSync] Poll failed:', response.status);
      return;
    }
    
    const data = await response.json();
    if (!data.ok || !data.messages || data.messages.length === 0) {
      console.log('[AgentSync] No messages in response');
      return;
    }
    
    const currentMessages = get(messages);
    const currentIds = new Set(currentMessages.map(m => m.id));
    const currentContentHashes = new Set(
      currentMessages.map(m => `${m.role}:${m.content.slice(0, 100)}`)
    );
    
    const newMessages: ChatMessage[] = [];
    
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
      
      // Skip meta responses and system notifications
      const trimmed = content.trim();
      if (trimmed === 'NO_REPLY' || trimmed === 'HEARTBEAT_OK') continue;
      if (trimmed.startsWith('System: [')) continue;
      if (trimmed.startsWith('sent ') && trimmed.includes('bytes')) continue;
      if (trimmed.startsWith('[main ') && (trimmed.includes('fix:') || trimmed.includes('feat:'))) continue;
      if (trimmed.startsWith('sha256:')) continue;
      if (trimmed.startsWith('DEPRECATED:')) continue;
      if (trimmed.match(/^[a-f0-9]{64}$/)) continue;
      
      const messageId = msg.id || `poll-${hashContent(msg.role + ':' + content)}`;
      
      // Skip if already exists (by ID or content)
      if (currentIds.has(messageId)) continue;
      
      const contentHash = `${msg.role}:${content.slice(0, 100)}`;
      if (currentContentHashes.has(contentHash)) continue;
      
      // **CRITICAL FIX**: Ensure assistant messages from other agents stay as 'assistant'
      // The gateway returns the correct role, we just need to preserve it
      const role = msg.role === 'assistant' ? 'assistant' : msg.role === 'user' ? 'user' : 'assistant';
      
      newMessages.push({
        id: messageId,
        role,
        content,
        createdAt: new Date(msg.timestamp || msg.created_at || Date.now()),
        isStreaming: false
      });
      
      currentIds.add(messageId);
      currentContentHashes.add(contentHash);
      lastSeenMessageId = messageId;
    }
    
    if (newMessages.length > 0) {
      console.log('[AgentSync] Found', newMessages.length, 'new messages');
      
      // Sort by timestamp
      newMessages.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
      
      // Add to store
      for (const msg of newMessages) {
        messages.addMessage(msg);
      }
      
      // Mark as having new messages (for unread indicator)
      const currentAgent = get(selectedAgentId);
      if (agentId !== currentAgent) {
        // Only set unread flag if NOT currently viewing this agent
        newMessagesDetected.update(map => ({ ...map, [agentId]: true }));
        console.log('[AgentSync] Unread indicator set for agent:', agentId);
      }
      
      // Sync to DB
      await fetch('/api/chat/history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          messages: newMessages.map(m => ({ 
            id: m.id, 
            role: m.role, 
            content: m.content 
          })),
          agentId
        })
      });
      
      console.log('[AgentSync] Synced new messages to DB');
    } else {
      console.log('[AgentSync] No new messages');
    }
    
    lastPollTime.set(Date.now());
    
  } catch (e) {
    console.warn('[AgentSync] Poll error:', e);
  } finally {
    isPolling = false;
  }
}

// Start polling for a specific agent
export function startPolling(agentId: string): void {
  // Stop any existing poll
  stopPolling();
  
  // Only poll for non-main agents
  if (agentId === 'main') {
    console.log('[AgentSync] Skipping polling for main agent (uses SSE)');
    return;
  }
  
  console.log('[AgentSync] Starting polling for agent:', agentId);
  pollingActive.set(true);
  lastSeenMessageId = null;
  
  // Initial poll immediately
  pollAgentHistory(agentId);
  
  // Then poll every 4 seconds
  pollTimer = setInterval(() => {
    const currentAgent = get(selectedAgentId);
    
    // Stop if agent changed
    if (currentAgent !== agentId) {
      console.log('[AgentSync] Agent changed, stopping poll');
      stopPolling();
      return;
    }
    
    pollAgentHistory(agentId);
  }, 4000);
}

// Stop polling
export function stopPolling(): void {
  if (pollTimer) {
    console.log('[AgentSync] Stopping polling');
    clearInterval(pollTimer);
    pollTimer = null;
  }
  
  pollingActive.set(false);
  lastSeenMessageId = null;
}

// Subscribe to agent changes and manage polling
selectedAgentId.subscribe(agentId => {
  if (agentId && typeof window !== 'undefined') {
    // Stop any existing poll
    stopPolling();
    
    // Start polling for non-main agents
    if (agentId !== 'main') {
      startPolling(agentId);
    }
  }
});
