<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import { X, MessageSquare, Trash2, Plus } from 'lucide-svelte';
  import { conversationsList, currentConversation, sidebarOpen } from '$lib/stores/chat';
  
  const dispatch = createEventDispatcher<{
    select: { id: string };
    new: void;
    delete: { id: string };
  }>();
  
  onMount(() => {
    conversationsList.load();
  });
  
  function selectConversation(id: string) {
    dispatch('select', { id });
    sidebarOpen.set(false);
  }
  
  async function deleteConversation(e: MouseEvent, id: string) {
    e.stopPropagation();
    if (!confirm('Chat wirklich löschen?')) return;
    
    try {
      const response = await fetch(`/api/conversations/${id}`, { method: 'DELETE' });
      if (response.ok) {
        conversationsList.remove(id);
        if ($currentConversation?.id === id) {
          dispatch('new');
        }
      }
    } catch (e) {
      console.error('Failed to delete conversation:', e);
    }
  }
  
  function handleNewChat() {
    dispatch('new');
    sidebarOpen.set(false);
  }
  
  function formatDate(date: Date): string {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (days === 0) return 'Heute';
    if (days === 1) return 'Gestern';
    if (days < 7) return `Vor ${days} Tagen`;
    return date.toLocaleDateString('de-DE');
  }
</script>

<!-- Desktop Sidebar -->
<aside class="hidden sm:flex flex-col w-64 bg-bg-secondary border-r border-border h-screen">
  <div class="p-3 border-b border-border">
    <button
      on:click={handleNewChat}
      class="w-full flex items-center justify-center gap-2 px-4 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg transition-colors"
    >
      <Plus class="w-4 h-4" />
      Neuer Chat
    </button>
  </div>
  
  <div class="flex-1 overflow-y-auto p-2">
    {#if $conversationsList.length === 0}
      <p class="text-text-secondary text-sm text-center py-4">Noch keine Chats</p>
    {:else}
      <div class="space-y-1">
        {#each $conversationsList as conv}
          <button
            on:click={() => selectConversation(conv.id)}
            class="w-full group flex items-center gap-2 px-3 py-2 rounded-lg text-left transition-colors
              {$currentConversation?.id === conv.id 
                ? 'bg-accent/20 text-accent' 
                : 'hover:bg-bg-tertiary text-text-primary'}"
          >
            <MessageSquare class="w-4 h-4 flex-shrink-0 text-text-secondary" />
            <div class="flex-1 min-w-0">
              <p class="truncate text-sm">{conv.title}</p>
              <p class="text-xs text-text-secondary">{formatDate(conv.updatedAt)}</p>
            </div>
            <button
              on:click={(e) => deleteConversation(e, conv.id)}
              class="p-1 opacity-0 group-hover:opacity-100 hover:text-red-400 transition-opacity"
              title="Löschen"
            >
              <Trash2 class="w-4 h-4" />
            </button>
          </button>
        {/each}
      </div>
    {/if}
  </div>
</aside>

<!-- Mobile Overlay -->
{#if $sidebarOpen}
  <div 
    class="sm:hidden fixed inset-0 z-50 flex"
    role="dialog"
    aria-modal="true"
  >
    <!-- Backdrop -->
    <button
      class="absolute inset-0 bg-black/50"
      on:click={() => sidebarOpen.set(false)}
      aria-label="Sidebar schließen"
    ></button>
    
    <!-- Sidebar Panel -->
    <aside class="relative w-72 max-w-[80vw] bg-bg-secondary flex flex-col h-full animate-slide-in">
      <div class="flex items-center justify-between p-3 border-b border-border">
        <h2 class="font-semibold text-text-primary">Chats</h2>
        <button
          on:click={() => sidebarOpen.set(false)}
          class="p-2 rounded-lg hover:bg-bg-tertiary text-text-secondary"
        >
          <X class="w-5 h-5" />
        </button>
      </div>
      
      <div class="p-3">
        <button
          on:click={handleNewChat}
          class="w-full flex items-center justify-center gap-2 px-4 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg transition-colors"
        >
          <Plus class="w-4 h-4" />
          Neuer Chat
        </button>
      </div>
      
      <div class="flex-1 overflow-y-auto p-2">
        {#if $conversationsList.length === 0}
          <p class="text-text-secondary text-sm text-center py-4">Noch keine Chats</p>
        {:else}
          <div class="space-y-1">
            {#each $conversationsList as conv}
              <button
                on:click={() => selectConversation(conv.id)}
                class="w-full group flex items-center gap-2 px-3 py-2 rounded-lg text-left transition-colors
                  {$currentConversation?.id === conv.id 
                    ? 'bg-accent/20 text-accent' 
                    : 'hover:bg-bg-tertiary text-text-primary'}"
              >
                <MessageSquare class="w-4 h-4 flex-shrink-0 text-text-secondary" />
                <div class="flex-1 min-w-0">
                  <p class="truncate text-sm">{conv.title}</p>
                  <p class="text-xs text-text-secondary">{formatDate(conv.updatedAt)}</p>
                </div>
                <button
                  on:click={(e) => deleteConversation(e, conv.id)}
                  class="p-1 hover:text-red-400"
                  title="Löschen"
                >
                  <Trash2 class="w-4 h-4" />
                </button>
              </button>
            {/each}
          </div>
        {/if}
      </div>
    </aside>
  </div>
{/if}

<style>
  @keyframes slide-in {
    from {
      transform: translateX(-100%);
    }
    to {
      transform: translateX(0);
    }
  }
  
  .animate-slide-in {
    animation: slide-in 0.2s ease-out;
  }
</style>
