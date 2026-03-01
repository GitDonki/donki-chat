<script lang="ts">
  import { marked } from 'marked';
  import hljs from 'highlight.js';
  
  export let content: string;
  
  // Configure marked
  marked.setOptions({
    gfm: true,
    breaks: true,
  });
  
  // Custom renderer for code blocks with syntax highlighting
  const renderer = new marked.Renderer();
  
  renderer.code = ({ text, lang }) => {
    const language = lang && hljs.getLanguage(lang) ? lang : 'plaintext';
    const highlighted = hljs.highlight(text, { language }).value;
    return `<div class="code-block relative group">
      <div class="code-header flex justify-between items-center bg-bg-tertiary px-3 py-1 rounded-t-lg border-b border-border">
        <span class="text-xs text-text-secondary">${language}</span>
        <button class="copy-btn text-xs text-text-secondary hover:text-text-primary opacity-0 group-hover:opacity-100 transition-opacity" onclick="navigator.clipboard.writeText(this.closest('.code-block').querySelector('code').textContent)">
          Copy
        </button>
      </div>
      <pre class="!mt-0 !rounded-t-none"><code class="hljs language-${language}">${highlighted}</code></pre>
    </div>`;
  };
  
  marked.use({ renderer });
  
  // Fix unclosed code blocks before parsing
  function sanitizeMarkdown(text: string): string {
    if (!text) return '';
    
    // Count triple backticks - if odd, close the last one
    const tripleBackticks = (text.match(/```/g) || []).length;
    if (tripleBackticks % 2 !== 0) {
      text += '\n```';
    }
    
    // Count single backticks (not part of triple) - if odd, close
    // Remove triple backticks temporarily for counting
    const withoutTriple = text.replace(/```[\s\S]*?```/g, '');
    const singleBackticks = (withoutTriple.match(/`/g) || []).length;
    if (singleBackticks % 2 !== 0) {
      text += '`';
    }
    
    return text;
  }
  
  $: html = marked(sanitizeMarkdown(content || ''));
</script>

<div class="prose prose-invert max-w-none">
  {@html html}
</div>

<style>
  :global(.code-block) {
    margin: 1rem 0;
  }
  
  :global(.hljs) {
    background: transparent !important;
    padding: 0 !important;
  }
  
  :global(.prose pre) {
    background-color: var(--bg-tertiary);
    border: 1px solid var(--border);
  }
  
  :global(.prose code) {
    color: var(--text-primary);
  }
  
  :global(.prose a) {
    color: var(--accent);
  }
  
  :global(.prose a:hover) {
    color: var(--accent-hover);
  }
</style>
