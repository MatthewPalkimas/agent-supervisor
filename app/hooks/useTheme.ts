import { useEffect, useState } from 'react';

export type Theme = 'dark' | 'light';

function getInitial(): Theme {
  if (typeof window === 'undefined') return 'dark';
  const saved = window.localStorage.getItem('theme');
  if (saved === 'dark' || saved === 'light') return saved;
  return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>('dark');

  useEffect(() => {
    const initial = getInitial();
    setTheme(initial);
    document.documentElement.dataset.theme = initial;
  }, []);

  const toggle = () => {
    setTheme(prev => {
      const next: Theme = prev === 'dark' ? 'light' : 'dark';
      document.documentElement.dataset.theme = next;
      try { window.localStorage.setItem('theme', next); } catch {}
      return next;
    });
  };

  return { theme, toggle };
}
