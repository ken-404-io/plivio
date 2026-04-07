export type Theme = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'plivio-theme';

function resolveTheme(theme: Theme): 'light' | 'dark' {
  if (theme === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return theme;
}

function applyTheme(theme: Theme) {
  document.documentElement.setAttribute('data-theme', resolveTheme(theme));
}

export function getTheme(): Theme {
  return (localStorage.getItem(STORAGE_KEY) as Theme) ?? 'system';
}

export function setTheme(theme: Theme) {
  localStorage.setItem(STORAGE_KEY, theme);
  applyTheme(theme);
}

export function initTheme() {
  applyTheme(getTheme());
  // Keep in sync if user changes OS preference while on 'system'
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (getTheme() === 'system') applyTheme('system');
  });
}
