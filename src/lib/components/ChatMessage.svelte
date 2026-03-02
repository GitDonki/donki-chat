<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import MarkdownRenderer from './MarkdownRenderer.svelte';
  import TypingIndicator from './TypingIndicator.svelte';
  import { User, SmilePlus } from 'lucide-svelte';
  import type { ChatMessage } from '$lib/stores/chat';
  
  export let message: ChatMessage;
  export let agentName: string = 'Donki';
  export let agentEmoji: string = '🐧';
  export let agentAvatar: string | null = null;
  
  const dispatch = createEventDispatcher<{
    reaction: { messageId: string; emoji: string; reactions: string[] };
  }>();
  
  // Show typing indicator when streaming and content is empty
  $: showTyping = message.isStreaming && !message.content;
  
  // Default Donki avatar
  const defaultAvatar = 'https://files.catbox.moe/3vz1n6.jpg';
  $: avatarUrl = agentAvatar || (agentName === 'Donki' ? defaultAvatar : null);
  
  $: isUser = message.role === 'user';
  $: formattedTime = new Date(message.createdAt).toLocaleTimeString('de-DE', {
    hour: '2-digit',
    minute: '2-digit'
  });
  
  const quickReactions = ['👍', '❤️', '😂', '🎉'];
  let showReactionPicker = false;
  let isHovering = false;
  
  async function toggleReaction(emoji: string) {
    showReactionPicker = false;
    
    // Optimistic update: immediately update UI before API call
    const currentReactions = message.reactions || [];
    const idx = currentReactions.indexOf(emoji);
    const optimisticReactions = idx >= 0 
      ? currentReactions.filter(r => r !== emoji)
      : [...currentReactions, emoji];
    
    // Dispatch optimistic update immediately for snappy UI
    dispatch('reaction', { 
      messageId: message.id, 
      emoji, 
      reactions: optimisticReactions 
    });
    
    // Then persist to backend (fire and forget - UI already updated)
    try {
      const response = await fetch('/api/reactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId: message.id, emoji })
      });
      
      if (response.ok) {
        const data = await response.json();
        // Only sync if backend has different state (e.g. message was found)
        // Don't revert to empty array if backend couldn't find message
        if (data.reactions && data.reactions.length > 0) {
          dispatch('reaction', { 
            messageId: message.id, 
            emoji, 
            reactions: data.reactions 
          });
        }
      }
    } catch (err) {
      console.error('Reaction sync failed:', err);
      // Keep optimistic state - don't revert on error
    }
  }
  
  function handleClickOutside(e: MouseEvent) {
    const target = e.target as HTMLElement;
    if (!target.closest('.reaction-picker') && !target.closest('.reaction-trigger')) {
      showReactionPicker = false;
    }
  }
</script>

<svelte:window on:click={handleClickOutside} />

<div 
  class="message-row flex {isUser ? 'justify-end' : 'justify-start'} p-2 sm:p-3 gap-2 sm:gap-3"
  on:mouseenter={() => isHovering = true}
  on:mouseleave={() => { isHovering = false; showReactionPicker = false; }}
  role="article"
>
  <!-- Avatar (left for assistant) -->
  {#if !isUser}
    <div class="avatar flex-shrink-0">
      {#if avatarUrl}
        <img 
          src={avatarUrl} 
          alt={agentName} 
          class="w-8 h-8 sm:w-10 sm:h-10 rounded-full object-cover border-2 border-accent"
        />
      {:else}
        <div class="w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center bg-bg-tertiary border-2 border-accent text-xl">
          {agentEmoji}
        </div>
      {/if}
    </div>
  {/if}
  
  <!-- Message bubble container -->
  <div class="message-container relative max-w-[85%] sm:max-w-[70%]">
    <!-- Reaction button (shows on hover) -->
    {#if isHovering && !message.isStreaming}
      <div class="reaction-trigger absolute {isUser ? 'left-0 -translate-x-full pr-1' : 'right-0 translate-x-full pl-1'} top-0 z-10">
        <button
          type="button"
          on:click|stopPropagation={() => showReactionPicker = !showReactionPicker}
          class="p-1.5 rounded-full bg-bg-tertiary hover:bg-bg-secondary border border-border shadow-sm transition-all opacity-70 hover:opacity-100"
          title="Reaktion hinzufügen"
        >
          <SmilePlus class="w-4 h-4 text-text-secondary" />
        </button>
        
        <!-- Quick reaction picker -->
        {#if showReactionPicker}
          <div class="reaction-picker absolute {isUser ? 'right-0' : 'left-0'} top-full mt-1 flex gap-1 bg-bg-secondary border border-border rounded-full px-2 py-1 shadow-lg z-20">
            {#each quickReactions as emoji}
              <button
                type="button"
                on:click|stopPropagation={() => toggleReaction(emoji)}
                class="w-8 h-8 flex items-center justify-center rounded-full hover:bg-bg-tertiary transition-colors text-lg {message.reactions?.includes(emoji) ? 'bg-accent/20' : ''}"
              >
                {emoji}
              </button>
            {/each}
          </div>
        {/if}
      </div>
    {/if}
    
    <!-- Message bubble -->
    <div class="message-bubble {isUser ? 'bg-accent text-white' : 'bg-bg-secondary text-text-primary'} rounded-2xl px-3 py-2 sm:px-4 sm:py-3 {isUser ? 'rounded-br-md' : 'rounded-bl-md'}">
      <!-- Header with name and time -->
      <div class="header flex items-center gap-2 mb-1 text-xs {isUser ? 'text-white/70 justify-end' : 'text-text-secondary'}">
        <span class="font-medium {isUser ? 'text-white/90' : 'text-text-primary'}">
          {isUser ? 'Du' : agentName}
        </span>
        <span>{formattedTime}</span>
        {#if message.isStreaming}
          <span class="streaming-indicator w-2 h-2 bg-green-400 rounded-full animate-pulse"></span>
        {/if}
      </div>
      
      <!-- Images -->
      {#if message.images && message.images.length > 0}
        <div class="images flex flex-wrap gap-2 mb-2">
          {#each message.images as imageId}
            <img 
              src="/api/upload/{imageId}" 
              alt=""
              class="max-w-[200px] sm:max-w-xs max-h-36 sm:max-h-48 rounded-lg object-cover"
            />
          {/each}
        </div>
      {/if}
      
      <!-- Message content -->
      <div class="message-content">
        {#if showTyping}
          <TypingIndicator />
        {:else if isUser}
          <p class="whitespace-pre-wrap">{message.content}</p>
        {:else}
          <MarkdownRenderer content={message.content} />
        {/if}
      </div>
    </div>
    
    <!-- Reactions display -->
    {#if message.reactions && message.reactions.length > 0}
      <div class="reactions flex flex-wrap gap-1 mt-1 {isUser ? 'justify-end' : 'justify-start'}">
        {#each message.reactions as emoji}
          <button
            type="button"
            on:click={() => toggleReaction(emoji)}
            class="reaction-badge px-2 py-0.5 rounded-full bg-bg-tertiary border border-border text-sm hover:bg-bg-secondary transition-colors"
          >
            {emoji}
          </button>
        {/each}
      </div>
    {/if}
  </div>
  
  <!-- Avatar (right for user) -->
  {#if isUser}
    <div class="avatar flex-shrink-0">
      <div class="w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center bg-bg-tertiary border-2 border-border">
        <User class="w-5 h-5 sm:w-6 sm:h-6 text-text-secondary" />
      </div>
    </div>
  {/if}
</div>

<style>
  .message-bubble {
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
  }
  
  /* Make Donki's messages have a slightly different style */
  .message-row:not(.justify-end) .message-content :global(p) {
    margin-bottom: 0.5rem;
  }
  
  .message-row:not(.justify-end) .message-content :global(p:last-child) {
    margin-bottom: 0;
  }
</style>
