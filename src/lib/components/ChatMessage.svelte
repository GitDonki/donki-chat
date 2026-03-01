<script lang="ts">
  import MarkdownRenderer from './MarkdownRenderer.svelte';
  import { User } from 'lucide-svelte';
  import type { ChatMessage } from '$lib/stores/chat';
  
  export let message: ChatMessage;
  
  // Donki avatar URL
  const donkiAvatar = 'https://files.catbox.moe/3vz1n6.jpg';
  
  $: isUser = message.role === 'user';
  $: formattedTime = new Date(message.createdAt).toLocaleTimeString('de-DE', {
    hour: '2-digit',
    minute: '2-digit'
  });
</script>

<div class="message-row flex {isUser ? 'justify-end' : 'justify-start'} p-3 gap-3">
  <!-- Avatar (left for Donki) -->
  {#if !isUser}
    <div class="avatar flex-shrink-0">
      <img 
        src={donkiAvatar} 
        alt="Donki" 
        class="w-10 h-10 rounded-full object-cover border-2 border-accent"
      />
    </div>
  {/if}
  
  <!-- Message bubble -->
  <div class="message-bubble max-w-[70%] {isUser ? 'bg-accent text-white' : 'bg-bg-secondary text-text-primary'} rounded-2xl px-4 py-3 {isUser ? 'rounded-br-md' : 'rounded-bl-md'}">
    <!-- Header with name and time -->
    <div class="header flex items-center gap-2 mb-1 text-xs {isUser ? 'text-white/70 justify-end' : 'text-text-secondary'}">
      <span class="font-medium {isUser ? 'text-white/90' : 'text-text-primary'}">
        {isUser ? 'Du' : 'Donki'}
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
            class="max-w-xs max-h-48 rounded-lg object-cover"
          />
        {/each}
      </div>
    {/if}
    
    <!-- Message content -->
    <div class="message-content">
      {#if isUser}
        <p class="whitespace-pre-wrap">{message.content}</p>
      {:else}
        <MarkdownRenderer content={message.content} />
      {/if}
    </div>
  </div>
  
  <!-- Avatar (right for user) -->
  {#if isUser}
    <div class="avatar flex-shrink-0">
      <div class="w-10 h-10 rounded-full flex items-center justify-center bg-bg-tertiary border-2 border-border">
        <User class="w-6 h-6 text-text-secondary" />
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
