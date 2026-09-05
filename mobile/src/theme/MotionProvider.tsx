import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

type Preference = 'on' | 'off' | 'system';

type MotionValue = {
  // The one flag every animated component actually reads: false either
  // because the user turned animations off in Settings, or because the OS
  // reduce-motion setting is on and the preference is 'system'.
  enabled: boolean;
  preference: Preference;
  setPreference: (next: Preference) => void;
};

const STORAGE_KEY = 'showcase:motion';

const MotionContext = createContext<MotionValue>(null as any);

export function MotionProvider({ children }: { children: React.ReactNode }) {
  const [systemReduceMotion, setSystemReduceMotion] = useState(false);
  const [preference, setPreferenceState] = useState<Preference>('system');

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setSystemReduceMotion);
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setSystemReduceMotion);
    AsyncStorage.getItem(STORAGE_KEY).then((stored) => {
      if (stored === 'on' || stored === 'off') setPreferenceState(stored);
    });
    return () => sub.remove();
  }, []);

  const setPreference = (next: Preference) => {
    setPreferenceState(next);
    if (next === 'system') AsyncStorage.removeItem(STORAGE_KEY);
    else AsyncStorage.setItem(STORAGE_KEY, next);
  };

  const enabled = preference === 'on' ? true : preference === 'off' ? false : !systemReduceMotion;

  const value = useMemo<MotionValue>(
    () => ({ enabled, preference, setPreference }),
    [enabled, preference]
  );

  return <MotionContext.Provider value={value}>{children}</MotionContext.Provider>;
}

export function useMotion() {
  return useContext(MotionContext);
}
