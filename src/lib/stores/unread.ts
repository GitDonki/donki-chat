import { writable, derived, get } from 'svelte/store';
import { messages } from './chat';
import { selectedAgentId } from './team';
import { browser } from '$app/environment';

// Last seen timestamps per agent (stored in localStorage)
interface LastSeenMap {
  [agentId: string]: number;
}

const STORAGE_KEY = 'donki_chat_last_seen';

// Load from localStorage
function loadLastSeen(): LastSeenMap {
  if (!browser) return {};
  
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch {
    return {};
  }
}

// Save to localStorage
function saveLastSeen(map: LastSeenMap): void {
  if (!browser) return;
  
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch (e) {
    console.warn('[Unread] Failed to save last seen:', e);
  }
}

// Writable store for last seen timestamps
export const lastSeen = writable<LastSeenMap>(loadLastSeen());

// Subscribe to changes and persist
lastSeen.subscribe(map => {
  saveLastSeen(map);
});

/**
 * Mark agent as "seen" (update to current timestamp)
 */
export function markAgentAsSeen(agentId: string): void {
  lastSeen.update(map => ({
    ...map,
    [agentId]: Date.now()
  }));
  
  console.log('[Unread] Marked agent as seen:', agentId);
}

/**
 * Get unread count for a specific agent
 */
export function getUnreadCount(agentId: string): number {
  const allMessages = get(messages);
  const lastSeenMap = get(lastSeen);
  const lastSeenTime = lastSeenMap[agentId] || 0;
  
  // Count assistant messages newer than last seen for this agent
  // Note: We need to filter by agent somehow, but messages don't have agentId yet
  // For now: count all messages newer than last seen (works when each agent has separate conversation)
  const unreadCount = allMessages.filter(msg => {
    // Only count assistant messages (not user's own messages)
    if (msg.role !== 'assistant') return false;
    
    // Check if newer than last seen
    const msgTime = msg.createdAt.getTime();
    return msgTime > lastSeenTime;
  }).length;
  
  return unreadCount;
}

/**
 * Derived store: unread counts for all agents
 * Updates when messages or lastSeen changes
 */
export const unreadCounts = derived(
  [messages, lastSeen, selectedAgentId],
  ([$messages, $lastSeen, $selectedAgentId]) => {
    const counts: Record<string, number> = {};
    
    // For each agent, count unread messages
    // Note: This is simplified - ideally we'd filter messages by agent
    // For now, we assume messages store is filtered for current agent
    
    // Current agent has no unreads (since we're viewing it)
    if ($selectedAgentId) {
      counts[$selectedAgentId] = 0;
    }
    
    // TODO: When multi-agent message filtering is implemented,
    // calculate unread counts for other agents here
    
    return counts;
  }
);

/**
 * Auto-mark current agent as seen when viewing
 */
selectedAgentId.subscribe(agentId => {
  if (agentId && browser) {
    markAgentAsSeen(agentId);
  }
});
