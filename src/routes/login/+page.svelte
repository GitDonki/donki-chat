<script lang="ts">
  import { goto } from '$app/navigation';
  import { Loader2 } from 'lucide-svelte';
  
  let password = '';
  let error = '';
  let isLoading = false;
  
  async function handleSubmit() {
    if (!password.trim()) return;
    
    isLoading = true;
    error = '';
    
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        error = data.error || 'Login fehlgeschlagen';
        return;
      }
      
      // Redirect to chat
      goto('/');
    } catch (e) {
      error = 'Ein Fehler ist aufgetreten';
    } finally {
      isLoading = false;
    }
  }
  
  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      handleSubmit();
    }
  }
</script>

<svelte:head>
  <title>Login - Donki Chat</title>
</svelte:head>

<div class="min-h-screen flex items-center justify-center p-4">
  <div class="w-full max-w-sm">
    <div class="text-center mb-8">
      <span class="text-6xl mb-4 block">🐴</span>
      <h1 class="text-2xl font-bold text-text-primary">Donki Chat</h1>
      <p class="text-text-secondary mt-2">Bitte anmelden um fortzufahren</p>
    </div>
    
    <form on:submit|preventDefault={handleSubmit} class="space-y-4">
      <div>
        <input
          type="password"
          bind:value={password}
          on:keydown={handleKeydown}
          placeholder="Passwort"
          class="w-full bg-bg-secondary border border-border rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent text-text-primary placeholder-text-secondary"
          disabled={isLoading}
          autocomplete="current-password"
        />
      </div>
      
      {#if error}
        <p class="text-red-400 text-sm">{error}</p>
      {/if}
      
      <button
        type="submit"
        disabled={isLoading || !password.trim()}
        class="w-full py-3 px-4 bg-accent hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed rounded-lg font-medium text-white transition-colors flex items-center justify-center gap-2"
      >
        {#if isLoading}
          <Loader2 class="w-5 h-5 animate-spin" />
          <span>Wird angemeldet...</span>
        {:else}
          <span>Anmelden</span>
        {/if}
      </button>
    </form>
  </div>
</div>
