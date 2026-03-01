<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { Plus, Trash2 } from 'lucide-svelte';
  import ChatMessage from '$lib/components/ChatMessage.svelte';
  import ChatInput from '$lib/components/ChatInput.svelte';
  import { messages, currentConversation, isLoading, error, type ChatMessage as ChatMessageType } from '$lib/stores/chat';
  
  let messagesContainer: HTMLDivElement;
  let conversationId: string | null = null;
  
  onMount(async () => {
    // Start a new conversation on load
    await startNewConversation();
  });
  
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
  
  async function scrollToBottom() {
    await tick();
    if (messagesContainer) {
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
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
              
              if (event.type === 'delta' && event.content) {
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

<div class="flex flex-col h-screen">
  <!-- Header -->
  <header class="flex items-center justify-between px-3 py-2 sm:px-4 sm:py-3 bg-bg-secondary border-b border-border">
    <div class="flex items-center gap-2 sm:gap-3">
      <img 
        src="https://files.catbox.moe/3vz1n6.jpg" 
        alt="Donki" 
        class="w-8 h-8 sm:w-9 sm:h-9 rounded-full object-cover border-2 border-accent"
      />
      <h1 class="text-base sm:text-lg font-semibold text-text-primary">Donki Chat</h1>
    </div>
    
    <div class="flex items-center gap-1 sm:gap-2">
      <button
        on:click={startNewConversation}
        class="p-2 sm:p-2 rounded-lg hover:bg-bg-tertiary active:bg-bg-tertiary transition-colors text-text-secondary hover:text-text-primary"
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
