import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from "expo-router/react-navigation";
import { NativeTabs } from "expo-router/unstable-native-tabs";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const C = Colors[isDark ? "dark" : "light"];
  const navigationTheme = {
    ...(isDark ? DarkTheme : DefaultTheme),
    colors: {
      ...(isDark ? DarkTheme.colors : DefaultTheme.colors),
      background: C.screenBg,
      card: C.sheetBg,
      text: C.textPrimary,
      border: C.divider,
      primary: C.accent,
    },
  };

  return (
    <ThemeProvider value={navigationTheme}>
      <NativeTabs
        minimizeBehavior="onScrollDown"
        tintColor={C.tint}
        iconColor={{
          default: isDark ? Colors.dark.icon : Colors.light.icon,
          selected: C.tint,
        }}
        backgroundColor={isDark ? C.cardBg : "rgba(240, 240, 240, 0.8)"}
        blurEffect={
          isDark ? "systemChromeMaterialDark" : "systemChromeMaterial"
        }
      >
        <NativeTabs.Trigger name="index" disableScrollToTop>
          <NativeTabs.Trigger.Icon
            sf={{ default: "target", selected: "target" }}
            md="filter_center_focus"
          />
          <NativeTabs.Trigger.Label>Today</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="routines">
          <NativeTabs.Trigger.Icon
            sf={{
              default: "checklist",
              selected: "checklist",
            }}
            md="checklist"
          />
          <NativeTabs.Trigger.Label>Habits</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="journal">
          <NativeTabs.Trigger.Icon
            sf={{
              default: "book",
              selected: "book.fill",
            }}
            md="menu_book"
          />
          <NativeTabs.Trigger.Label>Journal</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="profile">
          <NativeTabs.Trigger.Icon
            sf={{
              default: "person",
              selected: "person.fill",
            }}
            md="person"
          />
          <NativeTabs.Trigger.Label>Profile</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
      </NativeTabs>
    </ThemeProvider>
  );
}
