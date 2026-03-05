<script lang="ts">
  import { ChevronUp, Loader2 } from 'lucide-svelte';
  import { pagination, loadMoreMessages } from '$lib/stores/chat';
  
  $: remaining = $pagination.total - $pagination.loaded;
</script>

{#if $pagination.hasMore}
  <div class="flex justify-center py-3">
    <button
      on:click={loadMoreMessages}
      disabled={$pagination.isLoading}
      class="flex items-center gap-2 px-4 py-2 text-sm font-medium text-text-secondary 
             hover:text-text-primary hover:bg-bg-tertiary rounded-lg transition-colors
             disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {#if $pagination.isLoading}
        <Loader2 class="w-4 h-4 animate-spin" />
        <span>Lade...</span>
      {:else}
        <ChevronUp class="w-4 h-4" />
        <span>Ältere laden ({remaining} weitere)</span>
      {/if}
    </button>
  </div>
{/if}
