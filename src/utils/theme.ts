import type { ThemeMode } from '../types';

export function applyTheme(theme: ThemeMode): void {
  if (theme === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
}
