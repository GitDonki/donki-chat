<script lang="ts">
  import { onMount, onDestroy, tick } from 'svelte';
  import { Sun, Moon, Menu, Trash2, EyeOff } from 'lucide-svelte';
  import { theme } from '$lib/stores/theme';
  import ChatMessage from '$lib/components/ChatMessage.svelte';
  import ChatInput from '$lib/components/ChatInput.svelte';
  import TeamSidebar from '$lib/components/TeamSidebar.svelte';
  import DateDivider from '$lib/components/DateDivider.svelte';
  import LoadMoreButton from '$lib/components/LoadMoreButton.svelte';
  import { 
    messages, 
    currentConversation, 
    isLoading, 
    error, 
    sidebarOpen,
    pagination,
    viewCleared,
    selectAgent,
    sendMessageToAgent,
    clearView,
    showAllMessages,
    type ChatMessage as ChatMessageType 
  } from '$lib/stores/chat';
  import { 
    teamMembers, 
    selectedAgentId, 
    selectedAgent, 
    loadTeam 
  } from '$lib/stores/team';
  import { connectSSE, disconnectSSE, trackRunId } from '$lib/stores/sse';
  import { stopPolling } from '$lib/stores/agent-sync';
  
  // Group messages by date for dividers
  function getDateKey(date: Date): string {
    return date.toISOString().split('T')[0];
  }
  
  // Check if we need a date divider before this message
  function needsDateDivider(messages: ChatMessageType[], index: number): boolean {
    if (index === 0) return true;
    const current = getDateKey(messages[index].createdAt);
    const previous = getDateKey(messages[index - 1].createdAt);
    return current !== previous;
  }
  
  let messagesContainer: HTMLDivElement;
  
  onMount(async () => {
    // Load team and select Donki by default
    await loadTeam();
    await selectAgent('main');
    // Note: SSE connection happens automatically via selectedAgentId.subscribe in sse.ts
  });
  
  onDestroy(() => {
    disconnectSSE();
    stopPolling();
  });
  
  async function handleAgentSelect(e: CustomEvent<{ agentId: string }>) {
    const { agentId } = e.detail;
    await selectAgent(agentId);
    await scrollToBottom();
  }
  
  function handleJumpToDate(e: CustomEvent<{ date: string }>) {
    const { date } = e.detail;
    // Find the first message with this date
    const targetMessage = $messages.find(m => {
      const msgDate = m.createdAt.toISOString().split('T')[0];
      return msgDate === date;
    });
    
    if (targetMessage) {
      // Find the message element and scroll to it
      const element = document.getElementById(`msg-${targetMessage.id}`);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  }
  
  async function scrollToBottom() {
    await tick();
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
    
    await scrollToBottom();
    
    const result = await sendMessageToAgent(
      message,
      images.length > 0 ? images : undefined,
      // onDelta
      async () => {
        await scrollToBottom();
      },
      // onComplete
      async () => {
        await scrollToBottom();
      }
    );
    
    // Track runId to avoid duplicate messages from SSE
    if (result.runId) {
      trackRunId(result.runId);
    }
  }
  
  async function clearHistory() {
    if (!$selectedAgent) return;
    
    if (confirm(`Chat mit ${$selectedAgent.name} wirklich löschen?`)) {
      try {
        await fetch(`/api/chat/history?agent=${$selectedAgent.id}`, {
          method: 'DELETE'
        });
        messages.clear();
      } catch (e) {
        error.set('Fehler beim Löschen');
      }
    }
  }
  
  function handleReaction(e: CustomEvent<{ messageId: string; emoji: string; reactions: string[] }>) {
    const { messageId, reactions } = e.detail;
    messages.updateMessage(messageId, { reactions });
  }
  
  // Get avatar URL for current agent
  function getAgentAvatar(agentId: string): string | null {
    // Default Donki avatar
    if (agentId === 'main') {
      return 'https://files.catbox.moe/3vz1n6.jpg';
    }
    // For other agents, return null (we'll use emoji)
    return null;
  }
</script>

<svelte:head>
  <title>Donki Chat{$selectedAgent ? ` - ${$selectedAgent.name}` : ''}</title>
</svelte:head>

<div class="flex h-screen">
  <!-- Team Sidebar -->
  <TeamSidebar on:select={handleAgentSelect} on:jumpToDate={handleJumpToDate} />
  
  <!-- Main Chat Area -->
  <div class="flex-1 flex flex-col min-w-0">
    <!-- Header -->
    <header class="flex items-center justify-between px-3 py-2 sm:px-4 sm:py-3 bg-bg-secondary border-b border-border">
      <div class="flex items-center gap-2 sm:gap-3">
        <!-- Hamburger menu for mobile -->
        <button
          on:click={() => sidebarOpen.set(true)}
          class="sm:hidden p-2 rounded-lg hover:bg-bg-tertiary active:bg-bg-tertiary transition-colors text-text-secondary hover:text-text-primary"
          title="Team"
        >
          <Menu class="w-5 h-5" />
        </button>
        
        <!-- Agent Avatar/Emoji -->
        {#if $selectedAgent}
          {#if getAgentAvatar($selectedAgent.id)}
            <img 
              src={getAgentAvatar($selectedAgent.id)}
              alt={$selectedAgent.name}
              class="w-8 h-8 sm:w-9 sm:h-9 rounded-full object-cover border-2 border-accent"
            />
          {:else}
            <div class="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-bg-tertiary border-2 border-accent flex items-center justify-center text-xl">
              {$selectedAgent.emoji}
            </div>
          {/if}
        {/if}
        
        <div class="min-w-0">
          <h1 class="text-base sm:text-lg font-semibold text-text-primary truncate">
            {#if $selectedAgent}
              Chat mit {$selectedAgent.name}
            {:else}
              Donki Chat
            {/if}
          </h1>
          {#if $selectedAgent && $selectedAgent.role}
            <p class="text-xs text-text-secondary">{$selectedAgent.role}</p>
          {/if}
        </div>
      </div>
      
      <div class="flex items-center gap-1 sm:gap-2">
        <button
          on:click={() => {
            // Cycle through: auto → dark → light → auto
            const modes = ['auto', 'dark', 'light'];
            const currentIndex = modes.indexOf($theme);
            const nextMode = modes[(currentIndex + 1) % modes.length];
            theme.set(nextMode);
          }}
          class="p-2 sm:p-2 rounded-lg hover:bg-bg-tertiary active:bg-bg-tertiary transition-colors text-text-secondary hover:text-text-primary"
          title={$theme === 'auto' ? 'Auto (20:00-06:00)' : $theme === 'dark' ? 'Dark Mode' : 'Light Mode'}
        >
          {#if $theme === 'auto'}
            <span class="text-sm">🌓</span>
          {:else if $theme === 'light'}
            <Moon class="w-5 h-5" />
          {:else}
            <Sun class="w-5 h-5" />
          {/if}
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
            {#if $selectedAgent}
              {#if getAgentAvatar($selectedAgent.id)}
                <img 
                  src={getAgentAvatar($selectedAgent.id)}
                  alt={$selectedAgent.name}
                  class="w-28 h-28 sm:w-32 sm:h-32 rounded-full object-contain bg-bg-tertiary border-4 border-accent mx-auto mb-4"
                />
              {:else}
                <div class="w-28 h-28 sm:w-32 sm:h-32 rounded-full bg-bg-tertiary border-4 border-accent mx-auto mb-4 flex items-center justify-center text-6xl">
                  {$selectedAgent.emoji}
                </div>
              {/if}
              <p class="text-base sm:text-lg">Willkommen beim Chat mit {$selectedAgent.name}! {$selectedAgent.emoji}</p>
              <p class="text-xs sm:text-sm mt-2">{$selectedAgent.role}</p>
            {:else}
              <p class="text-base sm:text-lg">Wähle einen Agent aus dem Team</p>
            {/if}
          </div>
        </div>
      {:else if $viewCleared}
        <!-- View cleared state -->
        <div class="flex items-center justify-center h-full px-4">
          <div class="text-center text-text-secondary">
            <EyeOff class="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p class="text-base">Ansicht geleert</p>
            <p class="text-sm mt-1 opacity-75">{$messages.length} Nachrichten ausgeblendet</p>
            <button
              on:click={showAllMessages}
              class="mt-4 px-4 py-2 text-sm bg-bg-tertiary hover:bg-accent/20 rounded-lg transition-colors"
            >
              Alle anzeigen
            </button>
          </div>
        </div>
      {:else}
        <!-- Load more button at top -->
        <LoadMoreButton />
        
        {#each $messages as message, index (message.id)}
          <!-- Date divider -->
          {#if needsDateDivider($messages, index)}
            <DateDivider date={message.createdAt} />
          {/if}
          
          <ChatMessage 
            {message} 
            agentName={$selectedAgent?.name || 'Donki'}
            agentEmoji={$selectedAgent?.emoji || '🐧'}
            agentAvatar={getAgentAvatar($selectedAgent?.id || 'main')}
            on:reaction={handleReaction} 
          />
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
      disabled={!$selectedAgent}
      isLoading={$isLoading}
      placeholder={$selectedAgent ? `Nachricht an ${$selectedAgent.name}...` : 'Agent auswählen...'}
    />
  </div>
</div>
