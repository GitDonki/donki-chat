<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { Send, Paperclip, X, Loader2 } from 'lucide-svelte';
  import ImageUpload from './ImageUpload.svelte';
  
  export let disabled = false;
  export let isLoading = false;
  
  const dispatch = createEventDispatcher<{
    send: { message: string; images: string[] };
  }>();
  
  let message = '';
  let uploadedImages: { id: string; preview: string }[] = [];
  let textarea: HTMLTextAreaElement;
  let showUpload = false;
  
  function handleSubmit() {
    if (!message.trim() && uploadedImages.length === 0) return;
    if (disabled || isLoading) return;
    
    dispatch('send', { 
      message: message.trim(), 
      images: uploadedImages.map(img => img.id) 
    });
    
    message = '';
    uploadedImages = [];
    showUpload = false;
    
    // Reset textarea height
    if (textarea) {
      textarea.style.height = 'auto';
    }
  }
  
  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      if (e.shiftKey || e.ctrlKey) {
        // Shift+Enter or Ctrl+Enter = neue Zeile (default textarea behavior)
        return;
      }
      // Enter = senden
      e.preventDefault();
      handleSubmit();
    }
  }
  
  function handleInput() {
    // Auto-resize textarea
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px';
    }
  }
  
  function handleImageUploaded(e: CustomEvent<{ id: string; preview: string }>) {
    uploadedImages = [...uploadedImages, e.detail];
    showUpload = false;
  }
  
  function removeImage(id: string) {
    uploadedImages = uploadedImages.filter(img => img.id !== id);
  }
</script>

<div class="chat-input bg-bg-secondary border-t border-border p-4">
  {#if uploadedImages.length > 0}
    <div class="image-previews flex flex-wrap gap-2 mb-3">
      {#each uploadedImages as image}
        <div class="relative group">
          <img 
            src={image.preview} 
            alt="Upload preview"
            class="w-16 h-16 object-cover rounded-lg border border-border"
          />
          <button
            type="button"
            on:click={() => removeImage(image.id)}
            class="absolute -top-2 -right-2 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <X class="w-3 h-3 text-white" />
          </button>
        </div>
      {/each}
    </div>
  {/if}
  
  {#if showUpload}
    <div class="mb-3">
      <ImageUpload on:uploaded={handleImageUploaded} on:cancel={() => showUpload = false} />
    </div>
  {/if}
  
  <form on:submit|preventDefault={handleSubmit} class="flex items-end gap-2">
    <button
      type="button"
      on:click={() => showUpload = !showUpload}
      class="p-2 rounded-lg hover:bg-bg-tertiary transition-colors text-text-secondary hover:text-text-primary"
      title="Bild hochladen"
    >
      <Paperclip class="w-5 h-5" />
    </button>
    
    <div class="flex-1 relative">
      <textarea
        bind:this={textarea}
        bind:value={message}
        on:keydown={handleKeydown}
        on:input={handleInput}
        placeholder="Schreibe eine Nachricht... (Enter zum Senden, Shift+Enter für neue Zeile)"
        rows="1"
        class="w-full bg-bg-tertiary border border-border rounded-lg px-4 py-3 pr-12 resize-none focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent text-text-primary placeholder-text-secondary"
        disabled={disabled || isLoading}
      ></textarea>
    </div>
    
    <button
      type="submit"
      disabled={disabled || isLoading || (!message.trim() && uploadedImages.length === 0)}
      class="p-3 rounded-lg bg-accent hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
    >
      {#if isLoading}
        <Loader2 class="w-5 h-5 text-white animate-spin" />
      {:else}
        <Send class="w-5 h-5 text-white" />
      {/if}
    </button>
  </form>
</div>

<style>
  textarea {
    max-height: 200px;
    min-height: 48px;
  }
</style>
