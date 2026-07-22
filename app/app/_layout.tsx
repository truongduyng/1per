import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from "expo-router/react-navigation";
import { router, Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import "react-native-reanimated";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import { useColorScheme } from "@/hooks/use-color-scheme";
import ProfileInitializer from "@/components/ProfileInitializer";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { ThemePreferenceProvider } from "@/contexts/ThemeContext";
import { useRevenueCat } from "@/hooks/useRevenueCat";

SplashScreen.preventAutoHideAsync();

export const unstable_settings = {
  anchor: "(tabs)",
};

export default function RootLayout() {
  return (
    <ThemePreferenceProvider>
      <AppLayout />
    </ThemePreferenceProvider>
  );
}

function AppLayout() {
  const colorScheme = useColorScheme();
  const { isLoading, hasActiveSubscription } = useRevenueCat();

  useEffect(() => {
    if (!isLoading) SplashScreen.hideAsync();
  }, [isLoading]);

  const handleInitialized = (needsOnboarding: boolean) => {
    if (needsOnboarding || !hasActiveSubscription()) {
      router.replace("/onboarding");
    }
  };

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <KeyboardProvider>
        <ThemeProvider
          value={colorScheme === "dark" ? DarkTheme : DefaultTheme}
        >
          <ProfileInitializer onInitialized={handleInitialized}>
            <Stack>
              <Stack.Screen
                name="(tabs)"
                options={{ headerShown: false, title: "" }}
              />
              <Stack.Screen
                name="onboarding"
                options={{ headerShown: false, gestureEnabled: false }}
              />
              <Stack.Screen
                name="focus"
                options={{ headerShown: false, presentation: "card" }}
              />
              <Stack.Screen
                name="evening-reset"
                options={{ headerShown: false, presentation: "card" }}
              />
              <Stack.Screen name="settings" options={{ title: "Settings" }} />
            </Stack>
          </ProfileInitializer>
          <StatusBar style={colorScheme === "dark" ? "light" : "dark"} />
        </ThemeProvider>
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}
