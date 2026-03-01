<script lang="ts">
  // Animated typing indicator with three bouncing dots
</script>

<div class="typing-indicator flex items-center gap-1.5 py-1">
  <span class="dot w-2.5 h-2.5 bg-text-secondary rounded-full"></span>
  <span class="dot w-2.5 h-2.5 bg-text-secondary rounded-full"></span>
  <span class="dot w-2.5 h-2.5 bg-text-secondary rounded-full"></span>
</div>

<style>
  .typing-indicator {
    min-height: 24px;
  }
  
  .dot {
    animation: bounce 1.4s infinite ease-in-out both;
  }
  
  .dot:nth-child(1) {
    animation-delay: -0.32s;
  }
  
  .dot:nth-child(2) {
    animation-delay: -0.16s;
  }
  
  .dot:nth-child(3) {
    animation-delay: 0s;
  }
  
  @keyframes bounce {
    0%, 80%, 100% {
      transform: scale(0.6);
      opacity: 0.4;
    }
    40% {
      transform: scale(1);
      opacity: 1;
    }
  }
</style>
