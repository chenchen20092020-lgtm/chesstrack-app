import { Stack, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { useFonts } from 'expo-font';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as SplashScreen from 'expo-splash-screen';
import {
  PlayfairDisplay_400Regular,
  PlayfairDisplay_700Bold,
} from '@expo-google-fonts/playfair-display';
import { Inter_400Regular, Inter_500Medium } from '@expo-google-fonts/inter';
import AsyncStorage from '@react-native-async-storage/async-storage';
import BrandSplash from '@/components/BrandSplash';

SplashScreen.preventAutoHideAsync();

const MIN_SPLASH_MS = 2200;

// Renders the root layout and loads app fonts.
export default function RootLayout(): React.JSX.Element | null {
  const [fontsLoaded, fontError] = useFonts({
    PlayfairDisplay_400Regular,
    PlayfairDisplay_700Bold,
    Inter_400Regular,
    Inter_500Medium,
  });
  // Fonts are usable once they load OR if loading errors (we fall back to
  // system fonts rather than blocking the app forever).
  const fontsReady = fontsLoaded || Boolean(fontError);

  const [minSplashDone, setMinSplashDone] = useState(false);
  const [onboardingChecked, setOnboardingChecked] = useState(false);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);

  // Hide the native splash as soon as fonts are resolved.
  useEffect(() => {
    if (fontsReady) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [fontsReady]);

  // Enforce a minimum branded-splash duration, independent of other async work.
  useEffect(() => {
    const timer = setTimeout(() => setMinSplashDone(true), MIN_SPLASH_MS);
    return () => clearTimeout(timer);
  }, []);

  // Check whether onboarding has been completed. Always resolves, even on error,
  // so the app can never get stuck waiting on storage.
  useEffect(() => {
    AsyncStorage.getItem('onboarding_complete')
      .then((value) => setNeedsOnboarding(!value))
      .catch(() => setNeedsOnboarding(false))
      .finally(() => setOnboardingChecked(true));
  }, []);

  const appReady = fontsReady && minSplashDone && onboardingChecked;

  // Redirect to onboarding only AFTER the Stack is mounted (appReady), so the
  // navigator exists when router.replace fires.
  useEffect(() => {
    if (appReady && needsOnboarding) {
      router.replace('/onboarding');
    }
  }, [appReady, needsOnboarding]);

  // Show the native splash until fonts resolve, then our branded splash.
  if (!fontsReady) return null;

  if (!appReady) {
    return (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <BrandSplash />
      </GestureHandlerRootView>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="game-review" options={{ presentation: 'modal' }} />
      </Stack>
    </GestureHandlerRootView>
  );
}
