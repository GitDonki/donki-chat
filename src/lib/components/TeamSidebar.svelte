<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import { X, Settings, Users } from 'lucide-svelte';
  import { teamMembers, selectedAgentId, loadTeam, isTeamLoading, type TeamMember } from '$lib/stores/team';
  import { sidebarOpen } from '$lib/stores/chat';
  import StatusPanel from './StatusPanel.svelte';
  
  const dispatch = createEventDispatcher<{
    select: { agentId: string };
  }>();
  
  onMount(() => {
    loadTeam();
  });
  
  function selectAgent(agentId: string) {
    dispatch('select', { agentId });
    sidebarOpen.set(false);
  }
  
  function getStatusColor(status: TeamMember['status']): string {
    switch (status) {
      case 'active': return 'bg-green-500';
      case 'working': return 'bg-yellow-500 animate-pulse';
      case 'idle': return 'bg-gray-400';
      case 'offline': return 'bg-gray-600';
      default: return 'bg-gray-400';
    }
  }
  
  function getStatusTitle(status: TeamMember['status']): string {
    switch (status) {
      case 'active': return 'Aktiv';
      case 'working': return 'Arbeitet...';
      case 'idle': return 'Bereit';
      case 'offline': return 'Offline';
      default: return 'Unbekannt';
    }
  }
</script>

<!-- Desktop Sidebar -->
<aside class="hidden sm:flex flex-col w-64 bg-bg-secondary border-r border-border h-screen">
  <!-- Team Section (top half) -->
  <div class="flex flex-col h-1/2 border-b border-border">
    <div class="p-3 border-b border-border flex items-center gap-2">
      <Users class="w-5 h-5 text-accent" />
      <h2 class="font-semibold text-text-primary">🐧 Donki Team</h2>
    </div>
    
    <div class="flex-1 overflow-y-auto p-2">
      {#if $isTeamLoading}
        <div class="flex items-center justify-center py-8">
          <div class="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin"></div>
        </div>
      {:else if $teamMembers.length === 0}
        <p class="text-text-secondary text-sm text-center py-4">Keine Team-Mitglieder</p>
      {:else}
        <div class="space-y-1">
          {#each $teamMembers as member}
            <button
              on:click={() => selectAgent(member.id)}
              class="w-full group flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all
                {$selectedAgentId === member.id 
                  ? 'bg-accent/20 border border-accent/30' 
                  : 'hover:bg-bg-tertiary border border-transparent'}"
            >
              <!-- Emoji Avatar -->
              <div class="relative flex-shrink-0">
                <span class="text-2xl">{member.emoji}</span>
                <!-- Status Dot -->
                <span 
                  class="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-bg-secondary {getStatusColor(member.status)}"
                  title={getStatusTitle(member.status)}
                ></span>
              </div>
              
              <!-- Info -->
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-1.5">
                  <p class="font-medium truncate text-sm
                    {$selectedAgentId === member.id ? 'text-accent' : 'text-text-primary'}">
                    {member.name}
                  </p>
                  {#if member.isDefault}
                    <span class="text-[10px] px-1.5 py-0.5 bg-accent/20 text-accent rounded-full">Chef</span>
                  {/if}
                </div>
                <p class="text-xs text-text-secondary truncate">{member.role}</p>
              </div>
              
              <!-- Selection indicator -->
              {#if $selectedAgentId === member.id}
                <div class="w-1.5 h-8 bg-accent rounded-full"></div>
              {/if}
            </button>
          {/each}
        </div>
      {/if}
    </div>
  </div>
  
  <!-- Status Section (bottom half) -->
  <div class="flex flex-col h-1/2">
    <StatusPanel />
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
        <div class="flex items-center gap-2">
          <Users class="w-5 h-5 text-accent" />
          <h2 class="font-semibold text-text-primary">🐧 Team</h2>
        </div>
        <button
          on:click={() => sidebarOpen.set(false)}
          class="p-2 rounded-lg hover:bg-bg-tertiary text-text-secondary"
        >
          <X class="w-5 h-5" />
        </button>
      </div>
      
      <div class="flex-1 overflow-y-auto p-2">
        {#if $isTeamLoading}
          <div class="flex items-center justify-center py-8">
            <div class="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin"></div>
          </div>
        {:else}
          <div class="space-y-1">
            {#each $teamMembers as member}
              <button
                on:click={() => selectAgent(member.id)}
                class="w-full group flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all
                  {$selectedAgentId === member.id 
                    ? 'bg-accent/20 border border-accent/30' 
                    : 'hover:bg-bg-tertiary border border-transparent'}"
              >
                <div class="relative flex-shrink-0">
                  <span class="text-2xl">{member.emoji}</span>
                  <span 
                    class="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-bg-secondary {getStatusColor(member.status)}"
                    title={getStatusTitle(member.status)}
                  ></span>
                </div>
                
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-1.5">
                    <p class="font-medium truncate text-sm
                      {$selectedAgentId === member.id ? 'text-accent' : 'text-text-primary'}">
                      {member.name}
                    </p>
                    {#if member.isDefault}
                      <span class="text-[10px] px-1.5 py-0.5 bg-accent/20 text-accent rounded-full">Chef</span>
                    {/if}
                  </div>
                  <p class="text-xs text-text-secondary truncate">{member.role}</p>
                </div>
                
                {#if $selectedAgentId === member.id}
                  <div class="w-1.5 h-8 bg-accent rounded-full"></div>
                {/if}
              </button>
            {/each}
          </div>
        {/if}
      </div>
      
      <div class="p-2 border-t border-border">
        <button
          class="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-text-secondary hover:bg-bg-tertiary hover:text-text-primary transition-colors text-sm"
        >
          <Settings class="w-4 h-4" />
          Einstellungen
        </button>
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
