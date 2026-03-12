<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import { X, Settings, Users, History, EyeOff, Calendar } from 'lucide-svelte';
  import { teamMembers, selectedAgentId, loadTeam, isTeamLoading, type TeamMember } from '$lib/stores/team';
  import { sidebarOpen, historyDates, viewCleared, clearView, showAllMessages, pagination } from '$lib/stores/chat';
  import { newMessagesDetected } from '$lib/stores/agent-sync';
  import StatusPanel from './StatusPanel.svelte';
  
  const dispatch = createEventDispatcher<{
    select: { agentId: string };
    jumpToDate: { date: string };
  }>();
  
  onMount(() => {
    loadTeam();
  });
  
  function selectAgent(agentId: string) {
    dispatch('select', { agentId });
    sidebarOpen.set(false);
  }
  
  function handleJumpToDate(date: string) {
    dispatch('jumpToDate', { date });
    sidebarOpen.set(false);
  }
  
  function formatDateLabel(dateStr: string): string {
    const date = new Date(dateStr + 'T00:00:00');
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today.getTime() - 86400000);
    const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    
    if (dateOnly.getTime() === today.getTime()) {
      return 'Heute';
    } else if (dateOnly.getTime() === yesterday.getTime()) {
      return 'Gestern';
    } else {
      return date.toLocaleDateString('de-DE', { 
        day: 'numeric', 
        month: 'short'
      });
    }
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
  <!-- Team Section -->
  <div class="flex flex-col border-b border-border" style="flex: 0 0 auto; max-height: 40%;">
    <div class="p-3 border-b border-border flex items-center gap-2">
      <Users class="w-5 h-5 text-accent" />
      <h2 class="font-semibold text-text-primary text-sm">🐧 Team</h2>
    </div>
    
    <div class="flex-1 overflow-y-auto p-2">
      {#if $isTeamLoading}
        <div class="flex items-center justify-center py-4">
          <div class="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin"></div>
        </div>
      {:else if $teamMembers.length === 0}
        <p class="text-text-secondary text-xs text-center py-2">Keine Team-Mitglieder</p>
      {:else}
        <div class="space-y-0.5">
          {#each $teamMembers as member}
            <button
              on:click={() => selectAgent(member.id)}
              class="w-full group flex items-center gap-2 px-2 py-1.5 rounded-lg text-left transition-all
                {$selectedAgentId === member.id 
                  ? 'bg-accent/20 border border-accent/30' 
                  : 'hover:bg-bg-tertiary border border-transparent'}"
            >
              <!-- Emoji Avatar -->
              <div class="relative flex-shrink-0">
                <span class="text-lg">{member.emoji}</span>
                <span 
                  class="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-bg-secondary {getStatusColor(member.status)}"
                  title={getStatusTitle(member.status)}
                ></span>
                <!-- Unread Indicator -->
                {#if $newMessagesDetected[member.id] && $selectedAgentId !== member.id}
                  <span 
                    class="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-bg-secondary animate-pulse"
                    title="Neue Nachrichten"
                  ></span>
                {/if}
              </div>
              
              <!-- Info -->
              <div class="flex-1 min-w-0">
                <p class="font-medium truncate text-xs
                  {$selectedAgentId === member.id ? 'text-accent' : 'text-text-primary'}">
                  {member.name}
                </p>
              </div>
              
              {#if $selectedAgentId === member.id}
                <div class="w-1 h-6 bg-accent rounded-full"></div>
              {/if}
            </button>
          {/each}
        </div>
      {/if}
    </div>
  </div>
  
  <!-- History Section -->
  <div class="flex flex-col flex-1 border-b border-border min-h-0">
    <div class="p-3 border-b border-border flex items-center justify-between">
      <div class="flex items-center gap-2">
        <History class="w-4 h-4 text-accent" />
        <h2 class="font-semibold text-text-primary text-sm">History</h2>
      </div>
      
      <!-- Clear View Button -->
      <button
        on:click={() => $viewCleared ? showAllMessages() : clearView()}
        class="p-1.5 rounded hover:bg-bg-tertiary transition-colors"
        title={$viewCleared ? 'Alle anzeigen' : 'Ansicht leeren'}
      >
        <EyeOff class="w-4 h-4 {$viewCleared ? 'text-accent' : 'text-text-secondary'}" />
      </button>
    </div>
    
    <div class="flex-1 overflow-y-auto p-2">
      {#if $historyDates.length === 0}
        <p class="text-text-secondary text-xs text-center py-4">Keine History</p>
      {:else}
        <div class="space-y-0.5">
          {#each $historyDates as item}
            <button
              on:click={() => handleJumpToDate(item.date)}
              class="w-full flex items-center justify-between px-2 py-1.5 rounded hover:bg-bg-tertiary transition-colors text-left"
            >
              <div class="flex items-center gap-2">
                <Calendar class="w-3.5 h-3.5 text-text-secondary" />
                <span class="text-xs text-text-primary">{formatDateLabel(item.date)}</span>
              </div>
              <span class="text-xs text-text-secondary bg-bg-tertiary px-1.5 py-0.5 rounded">
                {item.count}
              </span>
            </button>
          {/each}
        </div>
      {/if}
    </div>
    
    <!-- Pagination info -->
    {#if $pagination.total > 0}
      <div class="px-3 py-2 border-t border-border text-xs text-text-secondary">
        {$pagination.loaded} / {$pagination.total} Nachrichten
      </div>
    {/if}
  </div>
  
  <!-- Status Section (compact) -->
  <div class="flex flex-col" style="flex: 0 0 auto;">
    <StatusPanel compact={true} />
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
      <!-- Team Section -->
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
      
      <div class="overflow-y-auto p-2 border-b border-border" style="max-height: 40%;">
        {#if $isTeamLoading}
          <div class="flex items-center justify-center py-4">
            <div class="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin"></div>
          </div>
        {:else}
          <div class="space-y-1">
            {#each $teamMembers as member}
              <button
                on:click={() => selectAgent(member.id)}
                class="w-full group flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-all
                  {$selectedAgentId === member.id 
                    ? 'bg-accent/20 border border-accent/30' 
                    : 'hover:bg-bg-tertiary border border-transparent'}"
              >
                <div class="relative flex-shrink-0">
                  <span class="text-xl">{member.emoji}</span>
                  <span 
                    class="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-bg-secondary {getStatusColor(member.status)}"
                    title={getStatusTitle(member.status)}
                  ></span>
                  <!-- Unread Indicator -->
                  {#if $newMessagesDetected[member.id] && $selectedAgentId !== member.id}
                    <span 
                      class="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-bg-secondary animate-pulse"
                      title="Neue Nachrichten"
                    ></span>
                  {/if}
                </div>
                
                <div class="flex-1 min-w-0">
                  <p class="font-medium truncate text-sm
                    {$selectedAgentId === member.id ? 'text-accent' : 'text-text-primary'}">
                    {member.name}
                  </p>
                </div>
                
                {#if $selectedAgentId === member.id}
                  <div class="w-1 h-6 bg-accent rounded-full"></div>
                {/if}
              </button>
            {/each}
          </div>
        {/if}
      </div>
      
      <!-- History Section -->
      <div class="flex-1 flex flex-col min-h-0">
        <div class="flex items-center justify-between p-3 border-b border-border">
          <div class="flex items-center gap-2">
            <History class="w-4 h-4 text-accent" />
            <span class="font-medium text-text-primary text-sm">History</span>
          </div>
          <button
            on:click={() => $viewCleared ? showAllMessages() : clearView()}
            class="p-1.5 rounded hover:bg-bg-tertiary transition-colors"
            title={$viewCleared ? 'Alle anzeigen' : 'Ansicht leeren'}
          >
            <EyeOff class="w-4 h-4 {$viewCleared ? 'text-accent' : 'text-text-secondary'}" />
          </button>
        </div>
        
        <div class="flex-1 overflow-y-auto p-2">
          {#if $historyDates.length === 0}
            <p class="text-text-secondary text-xs text-center py-4">Keine History</p>
          {:else}
            <div class="space-y-0.5">
              {#each $historyDates as item}
                <button
                  on:click={() => handleJumpToDate(item.date)}
                  class="w-full flex items-center justify-between px-2 py-1.5 rounded hover:bg-bg-tertiary transition-colors text-left"
                >
                  <div class="flex items-center gap-2">
                    <Calendar class="w-3.5 h-3.5 text-text-secondary" />
                    <span class="text-sm text-text-primary">{formatDateLabel(item.date)}</span>
                  </div>
                  <span class="text-xs text-text-secondary bg-bg-tertiary px-1.5 py-0.5 rounded">
                    {item.count}
                  </span>
                </button>
              {/each}
            </div>
          {/if}
        </div>
      </div>
      
      <!-- Footer -->
      <div class="p-2 border-t border-border flex items-center justify-between text-xs text-text-secondary">
        {#if $pagination.total > 0}
          <span>{$pagination.loaded} / {$pagination.total}</span>
        {:else}
          <span></span>
        {/if}
        <button
          class="flex items-center gap-1 px-2 py-1 rounded hover:bg-bg-tertiary hover:text-text-primary transition-colors"
        >
          <Settings class="w-3.5 h-3.5" />
          <span>Settings</span>
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
