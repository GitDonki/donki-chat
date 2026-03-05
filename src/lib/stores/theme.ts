import { writable } from 'svelte/store';
import { browser } from '$app/environment';

export type Theme = 'dark' | 'light' | 'system' | 'auto';

// Auto theme schedule: dark mode from 20:00 to 06:00
const AUTO_DARK_START_HOUR = 20;
const AUTO_DARK_END_HOUR = 6;

function getInitialTheme(): Theme {
  if (!browser) return 'auto';
  
  const stored = localStorage.getItem('theme');
  if (stored === 'dark' || stored === 'light' || stored === 'system' || stored === 'auto') {
    return stored;
  }
  return 'auto';
}

function isNightTime(): boolean {
  const hour = new Date().getHours();
  return hour >= AUTO_DARK_START_HOUR || hour < AUTO_DARK_END_HOUR;
}

function getEffectiveTheme(theme: Theme): 'dark' | 'light' {
  if (theme === 'auto') {
    return isNightTime() ? 'dark' : 'light';
  }
  if (theme === 'system') {
    if (browser && window.matchMedia('(prefers-color-scheme: light)').matches) {
      return 'light';
    }
    return 'dark';
  }
  return theme;
}

let autoThemeInterval: ReturnType<typeof setInterval> | null = null;

function createThemeStore() {
  const { subscribe, set, update } = writable<Theme>(getInitialTheme());
  
  return {
    subscribe,
    set: (value: Theme) => {
      if (browser) {
        localStorage.setItem('theme', value);
        applyTheme(value);
        
        // Setup/teardown auto-theme interval
        if (value === 'auto') {
          startAutoThemeCheck();
        } else {
          stopAutoThemeCheck();
        }
      }
      set(value);
    },
    toggle: () => {
      update(current => {
        const effective = getEffectiveTheme(current);
        const next = effective === 'dark' ? 'light' : 'dark';
        if (browser) {
          localStorage.setItem('theme', next);
          applyTheme(next);
          stopAutoThemeCheck(); // Manual toggle disables auto mode
        }
        return next;
      });
    },
    init: () => {
      if (browser) {
        const theme = getInitialTheme();
        applyTheme(theme);
        
        // Start auto-theme if enabled
        if (theme === 'auto') {
          startAutoThemeCheck();
        }
        
        // Listen for system theme changes (only affects 'system' mode)
        window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', (e) => {
          const current = localStorage.getItem('theme') as Theme;
          if (current === 'system') {
            applyTheme('system');
          }
        });
      }
    }
  };
}

function startAutoThemeCheck() {
  if (autoThemeInterval) return; // Already running
  
  console.log('[Theme] Starting auto-theme check (20:00-06:00 = dark)');
  
  // Check every minute
  autoThemeInterval = setInterval(() => {
    const currentTheme = localStorage.getItem('theme') as Theme;
    if (currentTheme === 'auto') {
      applyTheme('auto');
    } else {
      // Theme was changed, stop checking
      stopAutoThemeCheck();
    }
  }, 60000); // Every minute
}

function stopAutoThemeCheck() {
  if (autoThemeInterval) {
    console.log('[Theme] Stopping auto-theme check');
    clearInterval(autoThemeInterval);
    autoThemeInterval = null;
  }
}

function applyTheme(theme: Theme) {
  if (!browser) return;
  
  const effective = getEffectiveTheme(theme);
  const root = document.documentElement;
  
  root.classList.remove('dark', 'light');
  root.classList.add(effective);
  root.setAttribute('data-theme', effective);
  
  // Debug log for auto mode
  if (theme === 'auto') {
    const hour = new Date().getHours();
    console.log(`[Theme] Auto mode: ${hour}:00 → ${effective}`);
  }
}

export const theme = createThemeStore();
