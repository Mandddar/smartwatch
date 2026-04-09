import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider } from '@/lib/auth';
import { ThemeProvider } from '@/lib/theme';
import { Platform, LogBox } from 'react-native';
import { initML } from '@/lib/ml';
import { registerBackgroundSync } from '@/lib/sync/backgroundSync';

// Suppress known warnings from third-party libraries (react-native-chart-kit, react-native-svg)
LogBox.ignoreLogs(['Unknown event handler property', 'TouchableMixin']);
if (Platform.OS === 'web') {
  const SUPPRESS = ['TouchableMixin', 'onResponderTerminate', 'Unknown event handler property', 'onPress'];
  const origWarn = console.warn.bind(console);
  const origError = console.error.bind(console);
  console.warn = (...args: any[]) => {
    if (typeof args[0] === 'string' && SUPPRESS.some((s) => args[0].includes(s))) return;
    origWarn(...args);
  };
  console.error = (...args: any[]) => {
    if (typeof args[0] === 'string' && SUPPRESS.some((s) => args[0].includes(s))) return;
    origError(...args);
  };
}

export default function RootLayout() {
  useEffect(() => {
    initML().catch((e) => console.warn('[ML] Init failed:', e));
    registerBackgroundSync().catch((e) => console.warn('[Sync] Background sync registration failed:', e));
  }, []);

  return (
    <ThemeProvider>
    <AuthProvider>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          headerStyle: { backgroundColor: '#0b1120' },
          headerTintColor: '#e8f0fe',
          headerTitleStyle: { fontWeight: '600' },
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="(auth)/login" options={{ headerShown: false }} />
        <Stack.Screen name="(auth)/register" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      </Stack>
    </AuthProvider>
    </ThemeProvider>
  );
}
