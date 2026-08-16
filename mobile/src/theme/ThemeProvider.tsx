import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';

import { Colors, darkColors, lightColors } from './tokens';

type Preference = 'light' | 'dark' | 'system';

type ThemeValue = {
  colors: Colors;
  dark: boolean;
  preference: Preference;
  setPreference: (next: Preference) => void;
  toggle: () => void;
};

const STORAGE_KEY = 'showcase:theme';

const ThemeContext = createContext<ThemeValue>(null as any);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const system = useColorScheme();
  const [preference, setPreferenceState] = useState<Preference>('system');

  // Mirrors js/theme.js: an explicit choice is remembered, and with no choice
  // recorded the OS setting wins.
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((stored) => {
      if (stored === 'light' || stored === 'dark') setPreferenceState(stored);
    });
  }, []);

  const setPreference = (next: Preference) => {
    setPreferenceState(next);
    if (next === 'system') AsyncStorage.removeItem(STORAGE_KEY);
    else AsyncStorage.setItem(STORAGE_KEY, next);
  };

  const dark = preference === 'system' ? system === 'dark' : preference === 'dark';

  const value = useMemo<ThemeValue>(
    () => ({
      colors: dark ? darkColors : lightColors,
      dark,
      preference,
      setPreference,
      toggle: () => setPreference(dark ? 'light' : 'dark'),
    }),
    [dark, preference]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
