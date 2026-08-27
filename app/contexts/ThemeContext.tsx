import React, { createContext, useContext, useState } from 'react';
import { useColorScheme as useSystemColorScheme } from 'react-native';
import { storage } from '@/lib/storage';

export type ThemePreference = 'system' | 'light' | 'dark';

interface ThemeContextType {
  preference: ThemePreference;
  colorScheme: 'light' | 'dark';
  setPreference: (pref: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextType>({
  preference: 'system',
  colorScheme: 'dark',
  setPreference: () => {},
});

const STORAGE_KEY = 'theme_preference';

export function ThemePreferenceProvider({ children }: { children: React.ReactNode }) {
  const systemColorScheme = useSystemColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>(
    (storage.getString(STORAGE_KEY) as ThemePreference) ?? 'system'
  );

  const colorScheme: 'light' | 'dark' =
    preference === 'system' ? ((systemColorScheme ?? 'dark') as 'light' | 'dark') : preference;

  const setPreference = (pref: ThemePreference) => {
    storage.set(STORAGE_KEY, pref);
    setPreferenceState(pref);
  };

  return (
    <ThemeContext.Provider value={{ preference, colorScheme, setPreference }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useThemePreference() {
  return useContext(ThemeContext);
}
