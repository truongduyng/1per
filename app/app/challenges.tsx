import GradientBackground from "@/components/GradientBackground";
import { useTheme } from "@/hooks/useTheme";
import { challengeOps, challenges, db } from "@/lib/db";
import { PRESET_CHALLENGES, type PresetChallenge } from "@/lib/presetChallenges";
import { Ionicons } from "@expo/vector-icons";
import { useLiveQuery } from "drizzle-orm/expo-sqlite";
import * as Haptics from "expo-haptics";
import { router, Stack } from "expo-router";
import React, { useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function ChallengesScreen() {
  const insets = useSafeAreaInsets();
  const C = useTheme();
  const [startingId, setStartingId] = useState<string | null>(null);

  const { data: activeChallenges } = useLiveQuery(db.select().from(challenges));
  const activePresetIds = useMemo(
    () => new Set((activeChallenges ?? []).map((c) => c.presetId)),
    [activeChallenges],
  );

  const startChallenge = async (preset: PresetChallenge) => {
    setStartingId(preset.id);
    try {
      await challengeOps.start(preset);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } finally {
      setStartingId(null);
    }
  };

  const handlePress = (preset: PresetChallenge) => {
    Alert.alert(
      preset.title,
      `This adds ${preset.rules.length} daily habit${preset.rules.length === 1 ? "" : "s"} for ${preset.durationDays} days.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Start Challenge", onPress: () => startChallenge(preset) },
      ],
    );
  };

  const s = makeStyles(C);

  return (
    <View style={s.container}>
      <GradientBackground />
      <Stack.Screen
        options={{
          title: "Challenges",
          headerShown: true,
          headerStyle: { backgroundColor: C.screenBg },
          headerTintColor: C.textPrimary,
          headerTitleStyle: { color: C.textPrimary },
          headerShadowVisible: false,
        }}
      />
      <ScrollView
        contentContainerStyle={[
          s.content,
          { paddingTop: 16, paddingBottom: insets.bottom + 40 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={s.intro}>
          A preset challenge bundles a set of daily rules into one commitment with a fixed
          finish line. Starting one adds its habits to Active Habits.
        </Text>

        <View style={s.list}>
          {PRESET_CHALLENGES.map((preset) => {
            const isActive = activePresetIds.has(preset.id);
            const isStarting = startingId === preset.id;
            return (
              <View key={preset.id} style={s.card}>
                <View style={s.cardHeader}>
                  <View style={s.iconWrap}>
                    <Ionicons name={preset.icon} size={22} color={C.accentText} />
                  </View>
                  <View style={s.flex}>
                    <Text style={s.title}>{preset.title}</Text>
                    <Text style={s.subtitle}>{preset.subtitle}</Text>
                  </View>
                  <View style={s.durationBadge}>
                    <Text style={s.durationText}>{preset.durationDays}d</Text>
                  </View>
                </View>

                <View style={s.rulesList}>
                  {preset.rules.map((rule) => (
                    <View key={rule.title} style={s.ruleRow}>
                      <Ionicons name={rule.icon} size={15} color={C.iconSecondary} />
                      <Text style={s.ruleText} numberOfLines={1}>
                        {rule.title}
                      </Text>
                    </View>
                  ))}
                </View>

                <Pressable
                  style={[s.startBtn, isActive && s.startBtnDisabled]}
                  disabled={isActive || isStarting}
                  onPress={() => handlePress(preset)}
                >
                  <Text style={[s.startBtnText, isActive && s.startBtnTextDisabled]}>
                    {isActive ? "Already Active" : isStarting ? "Starting…" : "Start Challenge"}
                  </Text>
                </Pressable>
              </View>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

function makeStyles(C: ReturnType<typeof import("@/hooks/useTheme").useTheme>) {
  return StyleSheet.create({
    container: { flex: 1 },
    content: {
      paddingHorizontal: 20,
      gap: 20,
    },
    intro: {
      fontSize: 13,
      lineHeight: 19,
      color: C.textSecondary,
    },
    list: { gap: 14 },
    card: {
      backgroundColor: C.cardBg,
      borderRadius: 20,
      borderCurve: "continuous",
      borderWidth: 1,
      borderColor: C.cardBorder,
      padding: 16,
      gap: 14,
    },
    cardHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
    },
    iconWrap: {
      width: 44,
      height: 44,
      borderRadius: 12,
      backgroundColor: C.accentBg,
      alignItems: "center",
      justifyContent: "center",
    },
    flex: { flex: 1 },
    title: { fontSize: 16, fontWeight: "700", color: C.textPrimary },
    subtitle: {
      fontSize: 13,
      color: C.textSecondary,
      marginTop: 2,
      lineHeight: 18,
    },
    durationBadge: {
      backgroundColor: C.inputBg,
      borderWidth: 1,
      borderColor: C.cardBorder,
      borderRadius: 20,
      paddingHorizontal: 10,
      paddingVertical: 5,
    },
    durationText: {
      fontSize: 12,
      fontWeight: "700",
      color: C.textSecondary,
    },
    rulesList: { gap: 8 },
    ruleRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    ruleText: {
      flex: 1,
      fontSize: 13,
      color: C.textSecondary,
    },
    startBtn: {
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: C.accentBg,
      borderWidth: 1,
      borderColor: C.accentBorder,
      borderRadius: 14,
      paddingVertical: 12,
    },
    startBtnDisabled: {
      backgroundColor: C.inputBg,
      borderColor: C.cardBorder,
    },
    startBtnText: {
      fontSize: 14,
      fontWeight: "700",
      color: C.accentText,
    },
    startBtnTextDisabled: {
      color: C.textQuaternary,
    },
  });
}
