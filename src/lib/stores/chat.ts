import { writable, derived } from 'svelte/store';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  images?: string[];
  createdAt: Date;
  isStreaming?: boolean;
}

export interface Conversation {
  id: string;
  title: string;
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

export const messages = createChatStore();
export const currentConversation = createConversationStore();
export const isLoading = createLoadingStore();
export const error = writable<string | null>(null);

// Derived store for checking if chat is empty
export const isEmpty = derived(messages, $messages => $messages.length === 0);
