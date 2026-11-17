import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from "expo-router/react-navigation";
import { router, Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect, useRef, useState } from "react";
import "react-native-reanimated";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import { useColorScheme } from "@/hooks/use-color-scheme";
import ProfileInitializer from "@/components/ProfileInitializer";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { ThemePreferenceProvider } from "@/contexts/ThemeContext";
import { useRevenueCat } from "@/hooks/useRevenueCat";
import * as Notifications from "expo-notifications";
import { Colors } from "@/constants/theme";

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
  const C = Colors[colorScheme ?? "dark"];
  const baseNavigationTheme = colorScheme === "dark" ? DarkTheme : DefaultTheme;
  const navigationTheme = {
    ...baseNavigationTheme,
    colors: {
      ...baseNavigationTheme.colors,
      background: C.screenBg,
      card: C.sheetBg,
      text: C.textPrimary,
      border: C.divider,
      primary: C.accent,
    },
  };
  const { isLoading, hasActiveSubscription } = useRevenueCat();
  const [isProfileReady, setIsProfileReady] = useState(false);

  // Driven by state (not a ref + callback) so whichever of RevenueCat or the
  // profile finishes last triggers the hide. ProfileInitializer captures its
  // callbacks once on mount, so a callback closing over `isLoading` goes stale.
  useEffect(() => {
    if (!isLoading && isProfileReady) {
      SplashScreen.hideAsync();
    }
  }, [isLoading, isProfileReady]);

  // Failsafe: never leave the user stuck on the splash if a startup call hangs.
  useEffect(() => {
    const timeout = setTimeout(() => SplashScreen.hideAsync(), 10000);
    return () => clearTimeout(timeout);
  }, []);

  // Tapping a journal reminder opens the Journal tab scrolled to that message.
  const lastResponse = Notifications.useLastNotificationResponse();
  const handledResponseId = useRef<string | null>(null);
  useEffect(() => {
    const entryId = lastResponse?.notification.request.content.data?.journalEntryId;
    const responseId = lastResponse?.notification.request.identifier ?? null;
    if (!entryId || !responseId || handledResponseId.current === responseId) return;
    handledResponseId.current = responseId;
    // Give the navigator a tick to mount on cold start.
    setTimeout(() => {
      try {
        router.navigate({ pathname: "/journal", params: { entry: String(entryId) } });
      } catch (error) {
        console.warn("Failed to open journal reminder:", error);
      }
    }, 300);
  }, [lastResponse]);

  const handleInitialized = (needsOnboarding: boolean) => {
    if (needsOnboarding || !hasActiveSubscription()) {
      router.replace("/onboarding");
    }
  };

  const handleProfileReady = () => setIsProfileReady(true);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <KeyboardProvider>
        <ThemeProvider
          value={navigationTheme}
        >
          <ProfileInitializer
            onInitialized={handleInitialized}
            onReady={handleProfileReady}
          >
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
                options={{ headerShown: true, presentation: "card" }}
              />
              <Stack.Screen
                name="evening-reset"
                options={{ headerShown: true, presentation: "card" }}
              />
              <Stack.Screen name="settings" options={{ title: "Settings" }} />
              <Stack.Screen name="challenges" options={{ title: "Challenges" }} />
            </Stack>
          </ProfileInitializer>
          <StatusBar style={colorScheme === "dark" ? "light" : "dark"} />
        </ThemeProvider>
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}
