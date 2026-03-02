<script lang="ts">
  import { RefreshCw, Activity, Clock, Zap, DollarSign } from 'lucide-svelte';
  import { selectedAgentId } from '$lib/stores/team';
  
  interface SessionStatus {
    model?: string;
    sessionStart?: string;
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
    cost?: number;
    turnCount?: number;
    reasoning?: string;
  }
  
  let status: SessionStatus | null = null;
  let loading = false;
  let error: string | null = null;
  
  async function refreshStatus() {
    loading = true;
    error = null;
    
    try {
      const response = await fetch(`/api/status?agentId=${$selectedAgentId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch status');
      }
      status = await response.json();
    } catch (e) {
      error = e instanceof Error ? e.message : 'Unknown error';
      status = null;
    } finally {
      loading = false;
    }
  }
  
  function formatTokens(n: number | undefined): string {
    if (!n) return '0';
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
    return n.toString();
  }
  
  function formatCost(cost: number | undefined): string {
    if (!cost) return '$0.00';
    return '$' + cost.toFixed(4);
  }
  
  function formatDuration(startTime: string | undefined): string {
    if (!startTime) return '-';
    const start = new Date(startTime);
    const now = new Date();
    const diffMs = now.getTime() - start.getTime();
    const mins = Math.floor(diffMs / 60000);
    const hours = Math.floor(mins / 60);
    if (hours > 0) return `${hours}h ${mins % 60}m`;
    return `${mins}m`;
  }
  
  function getModelShort(model: string | undefined): string {
    if (!model) return '-';
    // Extract model name from provider/model format
    const parts = model.split('/');
    const name = parts[parts.length - 1];
    // Shorten common names
    if (name.includes('opus')) return 'Opus';
    if (name.includes('sonnet')) return 'Sonnet';
    if (name.includes('haiku')) return 'Haiku';
    return name.slice(0, 15);
  }
  
  // Refresh when agent changes
  $: if ($selectedAgentId) {
    refreshStatus();
  }
</script>

<div class="flex flex-col h-full">
  <div class="flex items-center justify-between px-3 py-2 border-b border-border">
    <div class="flex items-center gap-2">
      <Activity class="w-4 h-4 text-accent" />
      <span class="text-sm font-medium text-text-primary">Status</span>
    </div>
    <button
      on:click={refreshStatus}
      disabled={loading}
      class="p-1.5 rounded hover:bg-bg-tertiary text-text-secondary hover:text-text-primary transition-colors disabled:opacity-50"
      title="Aktualisieren"
    >
      <RefreshCw class="w-4 h-4 {loading ? 'animate-spin' : ''}" />
    </button>
  </div>
  
  <div class="flex-1 overflow-y-auto p-3">
    {#if loading && !status}
      <div class="flex items-center justify-center py-4">
        <div class="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin"></div>
      </div>
    {:else if error}
      <p class="text-xs text-red-400 text-center py-2">{error}</p>
    {:else if status}
      <div class="space-y-3">
        <!-- Model -->
        <div class="flex items-center justify-between">
          <span class="text-xs text-text-secondary">Model</span>
          <span class="text-xs font-medium text-text-primary">{getModelShort(status.model)}</span>
        </div>
        
        <!-- Session Duration -->
        <div class="flex items-center justify-between">
          <span class="text-xs text-text-secondary flex items-center gap-1">
            <Clock class="w-3 h-3" /> Laufzeit
          </span>
          <span class="text-xs font-medium text-text-primary">{formatDuration(status.sessionStart)}</span>
        </div>
        
        <!-- Tokens -->
        <div class="flex items-center justify-between">
          <span class="text-xs text-text-secondary flex items-center gap-1">
            <Zap class="w-3 h-3" /> Tokens
          </span>
          <span class="text-xs font-medium text-text-primary">
            {formatTokens(status.inputTokens)} / {formatTokens(status.outputTokens)}
          </span>
        </div>
        
        <!-- Cost -->
        {#if status.cost !== undefined}
        <div class="flex items-center justify-between">
          <span class="text-xs text-text-secondary flex items-center gap-1">
            <DollarSign class="w-3 h-3" /> Kosten
          </span>
          <span class="text-xs font-medium text-green-400">{formatCost(status.cost)}</span>
        </div>
        {/if}
        
        <!-- Turns -->
        {#if status.turnCount}
        <div class="flex items-center justify-between">
          <span class="text-xs text-text-secondary">Turns</span>
          <span class="text-xs font-medium text-text-primary">{status.turnCount}</span>
        </div>
        {/if}
        
        <!-- Reasoning -->
        {#if status.reasoning}
        <div class="flex items-center justify-between">
          <span class="text-xs text-text-secondary">Reasoning</span>
          <span class="text-xs font-medium text-accent">{status.reasoning}</span>
        </div>
        {/if}
      </div>
    {:else}
      <p class="text-xs text-text-secondary text-center py-2">Keine Daten</p>
    {/if}
  </div>
</div>
