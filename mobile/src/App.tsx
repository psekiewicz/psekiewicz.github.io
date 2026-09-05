import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ErrorBoundary } from './components/ErrorBoundary';
import { AuthProvider } from './context/AuthContext';
import { RootNavigator } from './navigation/RootNavigator';
import { MotionProvider } from './theme/MotionProvider';
import { ThemeProvider, useTheme } from './theme/ThemeProvider';

function Shell() {
  const { dark } = useTheme();
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
