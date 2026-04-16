import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'higra-theme';
const CONTRAST_KEY = 'higra-contrast';

export function useTheme() {
  const [theme, setThemeState] = useState(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === 'light' ? 'light' : 'dark';
  });
  const [highContrast, setHighContrast] = useState(() => {
    return localStorage.getItem(CONTRAST_KEY) === 'high';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  useEffect(() => {
    if (highContrast) {
      document.documentElement.setAttribute('data-contrast', 'high');
    } else {
      document.documentElement.removeAttribute('data-contrast');
    }
    localStorage.setItem(CONTRAST_KEY, highContrast ? 'high' : 'normal');
  }, [highContrast]);

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }, []);

  const toggleContrast = useCallback(() => {
    setHighContrast((prev) => !prev);
  }, []);

  return { theme, toggleTheme, highContrast, toggleContrast };
}
