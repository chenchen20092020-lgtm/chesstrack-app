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
  const [fontsLoaded] = useFonts({
    PlayfairDisplay_400Regular,
    PlayfairDisplay_700Bold,
    Inter_400Regular,
    Inter_500Medium,
  });
  const [appReady, setAppReady] = useState(false);

  // Wait until fonts are loaded before mounting the Stack. Once the Stack is
  // mounted the navigator exists and router.replace() can safely fire.
  useEffect(() => {
    if (!fontsLoaded) return;

    const splashStart = Date.now();

    AsyncStorage.getItem('onboarding_complete').then((value) => {
      SplashScreen.hideAsync();

      const elapsed = Date.now() - splashStart;
      const remaining = Math.max(0, MIN_SPLASH_MS - elapsed);

      setTimeout(() => {
        if (!value) {
          router.replace('/onboarding');
        }
        setAppReady(true);
      }, remaining);
    });
  }, [fontsLoaded]);

  // Show the native splash until fonts load, then our branded splash.
  if (!fontsLoaded) return null;

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
