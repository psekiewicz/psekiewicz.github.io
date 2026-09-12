import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import React, { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ErrorBoundary } from './components/ErrorBoundary';
import { AuthProvider } from './context/AuthContext';
import { RootNavigator } from './navigation/RootNavigator';
import { MotionProvider } from './theme/MotionProvider';
import { ThemeProvider, useTheme } from './theme/ThemeProvider';

function Shell() {
  const { colors, dark } = useTheme();

  // The window behind everything React draws. Android's root view is white by
  // default and no screen style reaches it, so in dark mode it showed through
  // wherever the UI didn't paint: the moment between the native splash and the
  // first frame, the gap under a screen mid-transition, and the overscroll
  // stretch at the end of a list. Painting it the current ground is the whole
  // fix, and it has to be done here rather than in app.json because app.json
  // holds one colour and there are two themes.
  useEffect(() => {
    SystemUI.setBackgroundColorAsync(colors.bg).catch(() => {
      // Cosmetic. A device that refuses is left on the static app.json colour,
      // which is no worse than before and not worth failing a launch over.
    });
  }, [colors.bg]);

  return (
    <>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <RootNavigator />
    </>
  );
}

export default function App() {
  // Outside every provider on purpose: a throw inside ThemeProvider or
  // AuthProvider is exactly the case worth catching, and a boundary nested
  // under them would go down with them.
  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <ThemeProvider>
          <MotionProvider>
            <AuthProvider>
              <Shell />
            </AuthProvider>
          </MotionProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}
