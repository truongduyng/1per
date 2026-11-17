import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Text, View } from "react-native";

import { useTheme } from "@/hooks/useTheme";
import { ScreenShell } from "./shared";
import { makeStyles } from "./theme";

const APP_TOUR_ITEMS = [
  {
    icon: "radio-button-on-outline" as const,
    tab: "Clarity",
    title: "Know the one thing that matters",
    description: "1Per cuts through the noise so your day starts with one clear action, not a giant list.",
  },
  {
    icon: "repeat-outline" as const,
    tab: "Consistency",
    title: "Make progress feel repeatable",
    description: "Your keystone habit turns intention into a small daily win you can keep showing up for.",
  },
  {
    icon: "shield-checkmark-outline" as const,
    tab: "Protection",
    title: "Stay with the person you chose to become",
    description: "1Per helps protect your attention from the patterns that pulled you off track before.",
  },
] as const;

export function AppTourScreen({ onNext }: { onNext: () => void }) {
  const C = useTheme();
  const s = makeStyles(C);
  return (
    <ScreenShell onNext={onNext} cta="Got it">
      <View style={s.copyBlock}>
        <Text style={s.headline}>How 1Per helps you change.</Text>
        <Text style={s.body}>You bring the pain point. 1Per helps turn it into one daily system you can actually follow.</Text>
      </View>
      <View style={s.cardList}>
        {APP_TOUR_ITEMS.map((item) => (
          <View key={item.tab} style={s.tourCard}>
            <View style={s.tourIconWrap}>
              <Ionicons name={item.icon} size={24} color={C.accentText} />
            </View>
            <View style={s.flex}>
              <Text style={s.tourTitle}>{item.title}</Text>
              <Text style={s.tourDescription}>{item.description}</Text>
            </View>
          </View>
        ))}
      </View>
    </ScreenShell>
  );
}
