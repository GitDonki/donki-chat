<script lang="ts">
  export let date: Date;
  
  function formatDate(d: Date): string {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today.getTime() - 86400000);
    const dateOnly = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    
    if (dateOnly.getTime() === today.getTime()) {
      return 'Heute';
    } else if (dateOnly.getTime() === yesterday.getTime()) {
      return 'Gestern';
    } else {
      return d.toLocaleDateString('de-DE', { 
        weekday: 'short',
        day: 'numeric', 
        month: 'short',
        year: dateOnly.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
      });
    }
  }
</script>

<div class="flex items-center gap-3 py-3 px-4">
  <div class="flex-1 h-px bg-border"></div>
  <span class="text-xs text-text-secondary font-medium px-2">
    {formatDate(date)}
  </span>
  <div class="flex-1 h-px bg-border"></div>
</div>
