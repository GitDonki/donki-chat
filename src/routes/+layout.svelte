<script lang="ts">
  import { onMount } from 'svelte';
  import '../app.css';
  import { theme } from '$lib/stores/theme';
  
  // Import both highlight.js themes
  import 'highlight.js/styles/github-dark.css';
  
  onMount(() => {
    theme.init();
  });
  
  // Reactive class to handle code block styling
  $: isDark = $theme !== 'light';
</script>

<svelte:head>
  {#if !isDark}
    <style>
      /* Light mode code block override */
      .hljs {
        background: #f6f8fa !important;
        color: #24292e !important;
      }
      pre {
        background-color: #f6f8fa !important;
      }
    </style>
  {/if}
</svelte:head>

<div class="h-full bg-bg-primary transition-colors duration-200">
  <slot />
</div>
