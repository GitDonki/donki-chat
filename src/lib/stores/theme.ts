import { writable } from 'svelte/store';
import { browser } from '$app/environment';

export type Theme = 'dark' | 'light' | 'system';

function getInitialTheme(): Theme {
  if (!browser) return 'system';
  
  const stored = localStorage.getItem('theme');
  if (stored === 'dark' || stored === 'light' || stored === 'system') {
    return stored;
  }
  return 'system';
}

function getEffectiveTheme(theme: Theme): 'dark' | 'light' {
  if (theme === 'system') {
    if (browser && window.matchMedia('(prefers-color-scheme: light)').matches) {
      return 'light';
    }
    return 'dark';
  }
  return theme;
}

function createThemeStore() {
  const { subscribe, set, update } = writable<Theme>(getInitialTheme());
  
  return {
    subscribe,
    set: (value: Theme) => {
      if (browser) {
        localStorage.setItem('theme', value);
        applyTheme(value);
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
        }
        return next;
      });
    },
    init: () => {
      if (browser) {
        const theme = getInitialTheme();
        applyTheme(theme);
        
        // Listen for system theme changes
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

function applyTheme(theme: Theme) {
  if (!browser) return;
  
  const effective = getEffectiveTheme(theme);
  const root = document.documentElement;
  
  root.classList.remove('dark', 'light');
  root.classList.add(effective);
  root.setAttribute('data-theme', effective);
}

export const theme = createThemeStore();
