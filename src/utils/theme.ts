import type { ThemeMode } from '../types';

const LIGHT_THEME_COLOR = '#f8fafc';
const DARK_THEME_COLOR = '#0f172a';

let systemThemeQuery: MediaQueryList | undefined;
let systemThemeListener: ((event: MediaQueryListEvent) => void) | undefined;

export function applyTheme(theme: ThemeMode): void {
  const root = document.documentElement;
  if (theme === 'system') delete root.dataset.theme;
  else root.dataset.theme = theme;

  syncChromeTheme(theme === 'dark' || (theme === 'system' && prefersDark()));
  listenForSystemTheme(theme);
}

function syncChromeTheme(isDark: boolean): void {
  document.documentElement.style.colorScheme = isDark ? 'dark' : 'light';
  document
    .querySelector<HTMLMetaElement>('meta[name="theme-color"]')
    ?.setAttribute('content', isDark ? DARK_THEME_COLOR : LIGHT_THEME_COLOR);
}

function prefersDark(): boolean {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
  );
}

function listenForSystemTheme(theme: ThemeMode): void {
  if (systemThemeQuery && systemThemeListener) {
    systemThemeQuery.removeEventListener('change', systemThemeListener);
  }
  systemThemeQuery = undefined;
  systemThemeListener = undefined;
  if (theme !== 'system' || typeof window.matchMedia !== 'function') return;
  systemThemeQuery = window.matchMedia('(prefers-color-scheme: dark)');
  systemThemeListener = (event) => syncChromeTheme(event.matches);
  systemThemeQuery.addEventListener('change', systemThemeListener);
}
