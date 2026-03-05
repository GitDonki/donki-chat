import { writable, derived, get } from 'svelte/store';
import { selectedAgentId, type TeamMember } from './team';
import { trackRunId } from './sse';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  images?: string[];
  reactions?: string[];
  createdAt: Date;
  isStreaming?: boolean;
}

export interface HistoryDate {
  date: string;
  count: number;
}

export interface PaginationState {
  total: number;
  loaded: number;
  hasMore: boolean;
  isLoading: boolean;
}

export interface Conversation {
  id: string;
  title: string;
  agentId?: string;
  createdAt: Date;
  updatedAt: Date;
}

function createChatStore() {
  const { subscribe, set, update } = writable<ChatMessage[]>([]);
  
  return {
    subscribe,
    set,
    addMessage: (message: ChatMessage) => {
      update(messages => [...messages, message]);
    },
    updateMessage: (id: string, updates: Partial<ChatMessage>) => {
      update(messages => 
        messages.map(m => m.id === id ? { ...m, ...updates } : m)
      );
    },
    appendToMessage: (id: string, content: string) => {
      update(messages => 
        messages.map(m => m.id === id ? { ...m, content: m.content + content } : m)
      );
    },
    removeMessage: (id: string) => {
      update(messages => messages.filter(m => m.id !== id));
    },
    clear: () => set([])
  };
}

function createConversationStore() {
  const { subscribe, set, update } = writable<Conversation | null>(null);
  
  return {
    subscribe,
    set,
    updateTitle: (title: string) => {
      update(conv => conv ? { ...conv, title } : null);
    },
    clear: () => set(null)
  };
}

function createLoadingStore() {
  const { subscribe, set } = writable(false);
  
  return {
    subscribe,
    start: () => set(true),
    stop: () => set(false)
  };
}

function createConversationsListStore() {
  const { subscribe, set, update } = writable<Conversation[]>([]);
  
  return {
    subscribe,
    set,
    load: async () => {
      try {
        const response = await fetch('/api/conversations');
        if (response.ok) {
          const data = await response.json();
          set(data.conversations.map((c: any) => ({
            id: c.id,
            title: c.title,
            agentId: c.agent_id,
            createdAt: new Date(c.created_at),
            updatedAt: new Date(c.updated_at)
          })));
        }
      } catch (e) {
        console.error('Failed to load conversations:', e);
      }
    },
    remove: (id: string) => {
      update(convs => convs.filter(c => c.id !== id));
    },
    add: (conv: Conversation) => {
      update(convs => [conv, ...convs]);
    }
  };
}

export const messages = createChatStore();
export const currentConversation = createConversationStore();
export const conversationsList = createConversationsListStore();
export const isLoading = createLoadingStore();
export const error = writable<string | null>(null);
export const sidebarOpen = writable(false);

// Pagination state
export const pagination = writable<PaginationState>({
  total: 0,
  loaded: 0,
  hasMore: false,
  isLoading: false
});

// History dates for sidebar navigation
export const historyDates = writable<HistoryDate[]>([]);

// View cleared state (visual only, not persistent)
export const viewCleared = writable(false);

// Derived store for checking if chat is empty
export const isEmpty = derived(messages, $messages => $messages.length === 0);

// ===============================
// Agent-specific functions
// ===============================

// Parse message from API response
function parseMessage(m: any): ChatMessage | null {
  const id = m.id || crypto.randomUUID();
  
  // Extract content
  const content = typeof m.content === 'string' ? m.content : 
    Array.isArray(m.content) ? m.content.map((c: any) => c.text || '').join('') : '';
  
  // Skip system notifications and raw exec output
  const trimmed = content.trim();
  if (trimmed.startsWith('System: [')) return null;
  if (trimmed.startsWith('sent ') && trimmed.includes('bytes')) return null; // rsync
  if (trimmed.startsWith('[main ') && trimmed.includes('fix:')) return null; // git commits
  if (trimmed.startsWith('[main ') && trimmed.includes('feat:')) return null;
  if (trimmed.startsWith('sha256:')) return null; // docker hashes
  if (trimmed.startsWith('DEPRECATED:')) return null;
  if (trimmed.match(/^[a-f0-9]{64}$/)) return null; // container IDs
  
  return {
    id,
    role: m.role,
    content,
    images: m.images ? (typeof m.images === 'string' ? JSON.parse(m.images) : m.images) : undefined,
    reactions: m.reactions ? (typeof m.reactions === 'string' ? JSON.parse(m.reactions) : m.reactions) : undefined,
    createdAt: new Date(m.created_at || m.timestamp || Date.now()),
    isStreaming: false
  };
}

// Load history for a specific agent (paginated, last 50)
export async function loadAgentHistory(agentId: string): Promise<void> {
  try {
    // Reset view cleared state on new load
    viewCleared.set(false);
    
    const response = await fetch(`/api/chat/history?agent=${agentId}&paginated=true&limit=50&offset=0`);
    const data = await response.json();
    
    if (data.ok && data.messages) {
      // Deduplicate messages by ID
      const seenIds = new Set<string>();
      const loadedMessages: ChatMessage[] = [];
      
      for (const m of data.messages) {
        const parsed = parseMessage(m);
        if (!parsed || seenIds.has(parsed.id)) continue;
        seenIds.add(parsed.id);
        loadedMessages.push(parsed);
      }
      
      messages.set(loadedMessages);
      
      // Update pagination state
      pagination.set({
        total: data.total || loadedMessages.length,
        loaded: loadedMessages.length,
        hasMore: data.hasMore || false,
        isLoading: false
      });
      
      // Update current conversation
      currentConversation.set({
        id: data.conversationId,
        title: `Chat mit ${agentId === 'main' ? 'Donki' : agentId}`,
        agentId,
        createdAt: new Date(),
        updatedAt: new Date()
      });
      
      console.log('[Chat] Loaded', loadedMessages.length, 'of', data.total, 'messages for agent:', agentId);
      
      // Load history dates for sidebar
      loadHistoryDates(agentId);
    }
  } catch (e) {
    console.error('[Chat] Failed to load agent history:', e);
    messages.clear();
    pagination.set({ total: 0, loaded: 0, hasMore: false, isLoading: false });
  }
}

// Load more (older) messages
export async function loadMoreMessages(): Promise<void> {
  const pag = get(pagination);
  const agentId = get(selectedAgentId);
  
  if (pag.isLoading || !pag.hasMore) return;
  
  pagination.update(p => ({ ...p, isLoading: true }));
  
  try {
    const response = await fetch(`/api/chat/history?agent=${agentId}&paginated=true&limit=50&offset=${pag.loaded}`);
    const data = await response.json();
    
    if (data.ok && data.messages) {
      const currentMessages = get(messages);
      const seenIds = new Set(currentMessages.map(m => m.id));
      const newMessages: ChatMessage[] = [];
      
      for (const m of data.messages) {
        const parsed = parseMessage(m);
        if (!parsed || seenIds.has(parsed.id)) continue;
        newMessages.push(parsed);
      }
      
      // Prepend older messages (they come in chronological order)
      messages.set([...newMessages, ...currentMessages]);
      
      pagination.update(p => ({
        ...p,
        loaded: p.loaded + newMessages.length,
        hasMore: data.hasMore || false,
        isLoading: false
      }));
      
      console.log('[Chat] Loaded', newMessages.length, 'more messages');
    }
  } catch (e) {
    console.error('[Chat] Failed to load more messages:', e);
    pagination.update(p => ({ ...p, isLoading: false }));
  }
}

// Load history dates for sidebar
export async function loadHistoryDates(agentId: string): Promise<void> {
  try {
    const response = await fetch(`/api/chat/history/dates?agent=${agentId}`);
    const data = await response.json();
    
    if (data.ok && data.dates) {
      historyDates.set(data.dates);
    }
  } catch (e) {
    console.error('[Chat] Failed to load history dates:', e);
    historyDates.set([]);
  }
}

// Clear view (visual only)
export function clearView(): void {
  viewCleared.set(true);
}

// Show all messages again
export function showAllMessages(): void {
  viewCleared.set(false);
}

// Select an agent and load their history
export async function selectAgent(agentId: string): Promise<void> {
  // Update selected agent
  selectedAgentId.set(agentId);
  
  // Clear current messages
  messages.clear();
  
  // Load history for this agent
  await loadAgentHistory(agentId);
}

// Send message to currently selected agent
export async function sendMessageToAgent(
  content: string, 
  images?: string[],
  onDelta?: (delta: string) => void,
  onComplete?: () => void,
  onError?: (error: string) => void
): Promise<{ userMessageId: string; assistantMessageId: string; runId?: string }> {
  const agentId = get(selectedAgentId);
  const conversationId = `conv_${agentId}`;
  
  const userMessageId = crypto.randomUUID();
  const assistantMessageId = crypto.randomUUID();
  
  // Add user message immediately
  messages.addMessage({
    id: userMessageId,
    role: 'user',
    content,
    images: images?.length ? images : undefined,
    createdAt: new Date()
  });
  
  // Add placeholder for assistant
  messages.addMessage({
    id: assistantMessageId,
    role: 'assistant',
    content: '',
    createdAt: new Date(),
    isStreaming: true
  });
  
  isLoading.start();
  error.set(null);
  
  let runId: string | undefined;
  
  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: content,
        images,
        conversationId,
        agentId,
        userMessageId,
        assistantMessageId
      })
    });
    
    if (!response.ok) {
      throw new Error('Chat request failed');
    }
    
    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body');
    
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
          if (data === '[DONE]') continue;
          
          try {
            const event = JSON.parse(data);
            
            if (event.type === 'runId') {
              runId = event.runId;
              // IMPORTANT: Track runId IMMEDIATELY to prevent duplicates from SSE
              // SSE events can arrive before this function returns
              trackRunId(runId);
            } else if (event.type === 'delta' && event.content) {
              messages.appendToMessage(assistantMessageId, event.content);
              onDelta?.(event.content);
            } else if (event.type === 'no-reply') {
              messages.removeMessage(assistantMessageId);
            } else if (event.type === 'error') {
              error.set(event.error);
              onError?.(event.error);
            }
          } catch {
            // Skip non-JSON lines
          }
        }
      }
    }
    
    messages.updateMessage(assistantMessageId, { isStreaming: false });
    onComplete?.();
    
  } catch (e) {
    const errorMsg = e instanceof Error ? e.message : 'Ein Fehler ist aufgetreten';
    error.set(errorMsg);
    messages.removeMessage(assistantMessageId);
    onError?.(errorMsg);
  } finally {
    isLoading.stop();
  }
  
  return { userMessageId, assistantMessageId, runId };
}
