import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useSettings } from './settings';

export type Theme = 'light' | 'dark';

interface ThemeContextType {
  theme: 'light' | 'dark' | 'system';
  resolvedTheme: Theme;
  setTheme: (theme: 'light' | 'dark' | 'system') => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}

function getSystemTheme(): Theme {
  if (typeof window !== 'undefined') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return 'dark'; // fallback for SSR
}

function applyTheme(theme: Theme) {
  if (typeof document !== 'undefined') {
    const html = document.documentElement;

    if (theme === 'dark') {
      html.classList.remove('light');
      html.classList.add('dark');
    } else {
      html.classList.remove('dark');
      html.classList.add('light');
    }
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { settings, updateSettings } = useSettings();
  const [resolvedTheme, setResolvedTheme] = useState<Theme>('dark');

  // Determine the resolved theme based on settings and system preference
  useEffect(() => {
    if (settings.general.theme === 'system') {
      const systemTheme = getSystemTheme();
      setResolvedTheme(systemTheme);
    } else {
      setResolvedTheme(settings.general.theme);
    }
  }, [settings.general.theme]);

  // Apply the resolved theme to the DOM
  useEffect(() => {
    applyTheme(resolvedTheme);
  }, [resolvedTheme]);

  // Listen for system theme changes when using system theme
  useEffect(() => {
    if (settings.general.theme !== 'system') return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    const handleChange = () => {
      const systemTheme = getSystemTheme();
      setResolvedTheme(systemTheme);
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [settings.general.theme]);

  const setTheme = (theme: 'light' | 'dark' | 'system') => {
    updateSettings({
      ...settings,
      general: {
        ...settings.general,
        theme,
      },
    });
  };

  const toggleTheme = () => {
    if (settings.general.theme === 'system') {
      // If currently on system, switch to opposite of current resolved theme
      setTheme(resolvedTheme === 'dark' ? 'light' : 'dark');
    } else {
      // If on explicit theme, switch to the other one
      setTheme(settings.general.theme === 'dark' ? 'light' : 'dark');
    }
  };

  const value: ThemeContextType = {
    theme: settings.general.theme,
    resolvedTheme,
    setTheme,
    toggleTheme,
  };

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}
