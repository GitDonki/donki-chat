<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { Upload, X, Loader2 } from 'lucide-svelte';
  
  const dispatch = createEventDispatcher<{
    uploaded: { id: string; preview: string };
    cancel: void;
  }>();
  
  let fileInput: HTMLInputElement;
  let isUploading = false;
  let error = '';
  let dragOver = false;
  
  const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  const MAX_SIZE = 10 * 1024 * 1024; // 10MB
  
  async function uploadFile(file: File) {
    if (!ALLOWED_TYPES.includes(file.type)) {
      error = 'Nur JPEG, PNG, GIF und WebP erlaubt';
      return;
    }
    
    if (file.size > MAX_SIZE) {
      error = 'Maximale Dateigröße: 10MB';
      return;
    }
    
    isUploading = true;
    error = '';
    
    try {
      const formData = new FormData();
      formData.append('file', file);
      
      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData
      });
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Upload fehlgeschlagen');
      }
      
      const data = await response.json();
      
      // Create preview URL
      const preview = URL.createObjectURL(file);
      
      dispatch('uploaded', { id: data.id, preview });
    } catch (e) {
      error = e instanceof Error ? e.message : 'Upload fehlgeschlagen';
    } finally {
      isUploading = false;
    }
  }
  
  function handleFileSelect(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) {
      uploadFile(file);
    }
  }
  
  function handleDrop(e: DragEvent) {
    e.preventDefault();
    dragOver = false;
    
    const file = e.dataTransfer?.files[0];
    if (file) {
      uploadFile(file);
    }
  }
  
  function handleDragOver(e: DragEvent) {
    e.preventDefault();
    dragOver = true;
  }
  
  function handleDragLeave() {
    dragOver = false;
  }
</script>

<div 
  class="upload-area p-4 border-2 border-dashed rounded-lg transition-colors {dragOver ? 'border-accent bg-accent/10' : 'border-border'}"
  on:drop={handleDrop}
  on:dragover={handleDragOver}
  on:dragleave={handleDragLeave}
  role="button"
  tabindex="0"
>
  <input
    bind:this={fileInput}
    type="file"
    accept="image/jpeg,image/png,image/gif,image/webp"
    class="hidden"
    on:change={handleFileSelect}
  />
  
  {#if isUploading}
    <div class="flex items-center justify-center gap-2 text-text-secondary">
      <Loader2 class="w-5 h-5 animate-spin" />
      <span>Wird hochgeladen...</span>
    </div>
  {:else}
    <div class="flex items-center justify-between">
      <button
        type="button"
        on:click={() => fileInput.click()}
        class="flex items-center gap-2 text-text-secondary hover:text-text-primary transition-colors"
      >
        <Upload class="w-5 h-5" />
        <span>Bild auswählen oder hierher ziehen</span>
      </button>
      
      <button
        type="button"
        on:click={() => dispatch('cancel')}
        class="p-1 rounded hover:bg-bg-tertiary transition-colors text-text-secondary hover:text-text-primary"
      >
        <X class="w-4 h-4" />
      </button>
    </div>
  {/if}
  
  {#if error}
    <p class="mt-2 text-sm text-red-400">{error}</p>
  {/if}
</div>
