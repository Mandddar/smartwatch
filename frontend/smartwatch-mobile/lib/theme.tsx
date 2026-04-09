import React, { createContext, useContext, useState, useEffect } from 'react';

export interface Theme {
  bg: string;
  card: string;
  cardBorder: string;
  primary: string;
  hr: string;
  spo2: string;
  steps: string;
  sleep: string;
  gold: string;
  text: string;
  textSub: string;
  textMuted: string;
  isDark: boolean;
}

export const darkTheme: Theme = {
  bg: '#0b1120',
  card: '#141f35',
  cardBorder: '#1e3356',
  primary: '#5a7fbf',
  hr: '#c75e6b',
  spo2: '#5a9bb5',
  steps: '#5ba88a',
  sleep: '#8b7db8',
  gold: '#bfa45a',
  text: '#e8f0fe',
  textSub: '#7a97c0',
  textMuted: '#3d5478',
  isDark: true,
};

export const lightTheme: Theme = {
  bg: '#f0f2f5',
  card: '#ffffff',
  cardBorder: '#dde1e8',
  primary: '#3b6cb5',
  hr: '#b04a55',
  spo2: '#3d7f99',
  steps: '#3d8a6a',
  sleep: '#6b5e9e',
  gold: '#9a7d3a',
  text: '#1a1a2e',
  textSub: '#4a5568',
  textMuted: '#8896a7',
  isDark: false,
};

interface ThemeContextType {
  theme: Theme;
  isDark: boolean;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: darkTheme,
  isDark: true,
  toggle: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [isDark, setIsDark] = useState(true);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.localStorage) {
      const saved = localStorage.getItem('vw_theme');
      if (saved === 'light') setIsDark(false);
    }
  }, []);

  function toggle() {
    const next = !isDark;
    setIsDark(next);
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.setItem('vw_theme', next ? 'dark' : 'light');
    }
  }

  return (
    <ThemeContext.Provider value={{ theme: isDark ? darkTheme : lightTheme, isDark, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
