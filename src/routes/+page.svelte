<script lang="ts">
  import { onMount, onDestroy, tick } from 'svelte';
  import { Plus, Trash2, Sun, Moon, Menu } from 'lucide-svelte';
  import { theme } from '$lib/stores/theme';
  import ChatMessage from '$lib/components/ChatMessage.svelte';
  import ChatInput from '$lib/components/ChatInput.svelte';
  import Sidebar from '$lib/components/Sidebar.svelte';
  import { messages, currentConversation, conversationsList, isLoading, error, sidebarOpen, type ChatMessage as ChatMessageType } from '$lib/stores/chat';
  
  let messagesContainer: HTMLDivElement;
  let conversationId: string | null = null;
  let eventSource: EventSource | null = null;
  // Track message IDs we've sent from this UI to avoid duplicates
  let localMessageIds = new Set<string>();
  
  onMount(async () => {
    // Load conversations list and start a new conversation
    await conversationsList.load();
    await startNewConversation();
    // Sync gateway history in background
    syncGatewayHistory();
    // Subscribe to live events for messages from other channels
    subscribeToEvents();
  });
  
  onDestroy(() => {
    eventSource?.close();
  });
  
  function subscribeToEvents() {
    eventSource = new EventSource('/api/chat/events');
    
    eventSource.onmessage = async (event) => {
      try {
        const data = JSON.parse(event.data);
        
        if (data.type === 'chat' && data.payload) {
          const payload = data.payload;
          
          // Check if this is a message we need to display
          // payload.role: 'user' or 'assistant'
          // payload.content: the message content
          // payload.runId: unique identifier
          
          // Skip if this is a response to a message WE sent (we already show it via streaming)
          if (payload.runId && localMessageIds.has(payload.runId)) {
            return;
          }
          
          // Only show assistant messages from other channels
          // (user messages from other channels are not as relevant)
          if (payload.role === 'assistant' && payload.content) {
            const content = typeof payload.content === 'string' ? payload.content :
              Array.isArray(payload.content) ? payload.content.map((c: any) => c.text || '').join('') : '';
            
            if (!content.trim()) return;
            
            // Check if we already have this message (by content prefix)
            const currentMessages = $messages;
            const contentPrefix = `assistant:${content.slice(0, 100)}`;
            const exists = currentMessages.some((m: any) => 
              m.role === 'assistant' && `${m.role}:${m.content.slice(0, 100)}` === contentPrefix
            );
            
            if (!exists) {
              const newMessage: ChatMessageType = {
                id: payload.id || crypto.randomUUID(),
                role: 'assistant',
                content,
                createdAt: new Date(payload.timestamp || Date.now()),
                isStreaming: false
              };
              
              messages.addMessage(newMessage);
              await scrollToBottom();
              console.log('[Events] Added message from other channel');
            }
          }
        }
      } catch (e) {
        console.warn('[Events] Parse error:', e);
      }
    };
    
    eventSource.onerror = () => {
      console.warn('[Events] SSE connection error, will auto-reconnect');
    };
  }
  
  async function syncGatewayHistory() {
    try {
      const response = await fetch('/api/chat/history?limit=100');
      const data = await response.json();
      
      if (data.ok && data.messages?.length > 0) {
        // Transform gateway messages to our format
        const gatewayMessages = data.messages
          .filter((m: any) => m.role === 'user' || m.role === 'assistant')
          .map((m: any) => ({
            id: m.id || crypto.randomUUID(),
            role: m.role,
            content: typeof m.content === 'string' ? m.content : 
              Array.isArray(m.content) ? m.content.map((c: any) => c.text || '').join('') : '',
            createdAt: new Date(m.timestamp || m.createdAt || Date.now()),
            isStreaming: false
          }));
        
        // Merge with existing messages (avoid duplicates by content hash)
        const currentMessages = $messages;
        const existingContents = new Set(currentMessages.map((m: any) => `${m.role}:${m.content.slice(0, 100)}`));
        
        const newMessages = gatewayMessages.filter((m: any) => 
          !existingContents.has(`${m.role}:${m.content.slice(0, 100)}`)
        );
        
        if (newMessages.length > 0) {
          // Prepend gateway messages that we don't have locally
          const merged = [...newMessages, ...currentMessages].sort(
            (a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          );
          messages.set(merged);
          await scrollToBottom();
        }
      }
    } catch (e) {
      console.warn('[HistorySync] Failed to sync gateway history:', e);
    }
  }
  
  async function startNewConversation() {
    messages.clear();
    conversationId = crypto.randomUUID();
    currentConversation.set({
      id: conversationId,
      title: 'Neuer Chat',
      createdAt: new Date(),
      updatedAt: new Date()
    });
  }
  
  async function loadConversation(id: string) {
    try {
      const response = await fetch(`/api/conversations/${id}`);
      if (!response.ok) throw new Error('Failed to load conversation');
      
      const data = await response.json();
      
      conversationId = id;
      currentConversation.set({
        id: data.conversation.id,
        title: data.conversation.title,
        createdAt: new Date(data.conversation.created_at),
        updatedAt: new Date(data.conversation.updated_at)
      });
      
      // Load messages
      messages.set(data.messages.map((m: any) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        images: m.images,
        createdAt: new Date(m.created_at),
        isStreaming: false
      })));
      
      await scrollToBottom();
    } catch (e) {
      error.set('Fehler beim Laden des Chats');
    }
  }
  
  async function scrollToBottom() {
    await tick();
    // Double RAF ensures DOM is fully painted before scrolling
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (messagesContainer) {
          messagesContainer.scrollTo({
            top: messagesContainer.scrollHeight,
            behavior: 'instant'
          });
        }
      });
    });
  }
  
  async function handleSend(e: CustomEvent<{ message: string; images: string[] }>) {
    const { message, images } = e.detail;
    
    if (!message.trim() && images.length === 0) return;
    if (!conversationId) return;
    
    const userMessageId = crypto.randomUUID();
    const assistantMessageId = crypto.randomUUID();
    
    // Add user message
    const userMessage: ChatMessageType = {
      id: userMessageId,
      role: 'user',
      content: message,
      images: images.length > 0 ? images : undefined,
      createdAt: new Date()
    };
    messages.addMessage(userMessage);
    await scrollToBottom();
    
    // Add placeholder assistant message
    const assistantMessage: ChatMessageType = {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      createdAt: new Date(),
      isStreaming: true
    };
    messages.addMessage(assistantMessage);
    
    isLoading.start();
    error.set(null);
    
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          images,
          conversationId
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
              
              if (event.type === 'runId' && event.runId) {
                // Track this runId so we don't duplicate messages from SSE
                localMessageIds.add(event.runId);
              } else if (event.type === 'delta' && event.content) {
                messages.appendToMessage(assistantMessageId, event.content);
                await scrollToBottom();
              } else if (event.type === 'no-reply') {
                // Donki decided not to reply - remove placeholder
                messages.removeMessage(assistantMessageId);
              } else if (event.type === 'error') {
                error.set(event.error);
              }
            } catch {
              // Skip non-JSON lines
            }
          }
        }
      }
      
      messages.updateMessage(assistantMessageId, { isStreaming: false });
      
    } catch (e) {
      error.set(e instanceof Error ? e.message : 'Ein Fehler ist aufgetreten');
      messages.removeMessage(assistantMessageId);
    } finally {
      isLoading.stop();
    }
  }
  
  async function clearHistory() {
    if (confirm('Chat-Verlauf wirklich löschen?')) {
      try {
        await fetch(`/api/chat/history?conversationId=${conversationId}`, {
          method: 'DELETE'
        });
        messages.clear();
      } catch (e) {
        error.set('Fehler beim Löschen');
      }
    }
  }
</script>

<svelte:head>
  <title>Donki Chat</title>
</svelte:head>

<div class="flex h-screen">
  <!-- Sidebar -->
  <Sidebar 
    on:select={(e) => loadConversation(e.detail.id)}
    on:new={startNewConversation}
    on:delete={async () => { await conversationsList.load(); }}
  />
  
  <!-- Main Chat Area -->
  <div class="flex-1 flex flex-col min-w-0">
    <!-- Header -->
    <header class="flex items-center justify-between px-3 py-2 sm:px-4 sm:py-3 bg-bg-secondary border-b border-border">
      <div class="flex items-center gap-2 sm:gap-3">
        <!-- Hamburger menu for mobile -->
        <button
          on:click={() => sidebarOpen.set(true)}
          class="sm:hidden p-2 rounded-lg hover:bg-bg-tertiary active:bg-bg-tertiary transition-colors text-text-secondary hover:text-text-primary"
          title="Menü"
        >
          <Menu class="w-5 h-5" />
        </button>
        
        <img 
          src="https://files.catbox.moe/3vz1n6.jpg" 
          alt="Donki" 
          class="w-8 h-8 sm:w-9 sm:h-9 rounded-full object-cover border-2 border-accent"
        />
        <div class="min-w-0">
          <h1 class="text-base sm:text-lg font-semibold text-text-primary truncate">
            {$currentConversation?.title || 'Donki Chat'}
          </h1>
        </div>
      </div>
      
      <div class="flex items-center gap-1 sm:gap-2">
        <button
          on:click={() => theme.toggle()}
          class="p-2 sm:p-2 rounded-lg hover:bg-bg-tertiary active:bg-bg-tertiary transition-colors text-text-secondary hover:text-text-primary"
          title="Theme wechseln"
        >
          {#if $theme === 'light'}
            <Moon class="w-5 h-5" />
          {:else}
            <Sun class="w-5 h-5" />
          {/if}
        </button>
        
        <button
          on:click={startNewConversation}
          class="hidden sm:block p-2 rounded-lg hover:bg-bg-tertiary active:bg-bg-tertiary transition-colors text-text-secondary hover:text-text-primary"
          title="Neuer Chat"
        >
          <Plus class="w-5 h-5" />
        </button>
        
        <button
          on:click={clearHistory}
          class="p-2 sm:p-2 rounded-lg hover:bg-bg-tertiary active:bg-bg-tertiary transition-colors text-text-secondary hover:text-red-400"
          title="Chat löschen"
        >
          <Trash2 class="w-5 h-5" />
        </button>
      </div>
    </header>
    
    <!-- Messages -->
    <div 
      bind:this={messagesContainer}
      class="flex-1 overflow-y-auto"
    >
      {#if $messages.length === 0}
        <div class="flex items-center justify-center h-full px-4">
          <div class="text-center text-text-secondary">
            <img 
              src="https://files.catbox.moe/3vz1n6.jpg" 
              alt="Donki" 
              class="w-20 h-20 sm:w-24 sm:h-24 rounded-full object-cover border-4 border-accent mx-auto mb-3 sm:mb-4"
            />
            <p class="text-base sm:text-lg">Willkommen bei Donki Chat! 🐧</p>
            <p class="text-xs sm:text-sm mt-2">Schreibe eine Nachricht um zu beginnen.</p>
          </div>
        </div>
      {:else}
        {#each $messages as message (message.id)}
          <ChatMessage {message} />
        {/each}
      {/if}
    </div>
    
    <!-- Error -->
    {#if $error}
      <div class="px-4 py-2 bg-red-900/50 border-t border-red-500 text-red-300 text-sm">
        {$error}
      </div>
    {/if}
  
    <!-- Input -->
    <ChatInput 
      on:send={handleSend} 
      disabled={false}
      isLoading={$isLoading}
    />
  </div>
</div>
