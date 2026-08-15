import React, { useEffect, useState } from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { Slot, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Colors } from '../constants/colors';
import { useAppStore } from '../stores/useAppStore';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 1000 * 60 * 5,
    },
  },
});

export default function RootLayout() {
  const segments = useSegments();
  const router = useRouter();
  const hasCompletedOnboarding = useAppStore((s) => s.hasCompletedOnboarding);
  const [isReady, setIsReady] = useState(true);

  // Check onboarding navigation
  useEffect(() => {
    if (!isReady) return;
    const inOnboarding = segments[0] === 'onboarding';
    if (!hasCompletedOnboarding && !inOnboarding) {
      router.replace('/onboarding');
    }
  }, [hasCompletedOnboarding, segments, isReady]);

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <View style={styles.container}>
          <StatusBar style="dark" backgroundColor="transparent" translucent />
          <Slot />
        </View>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
});
