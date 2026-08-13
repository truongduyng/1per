import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React from "react";
import { Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { palette } from "@/constants/theme";
import { useTheme } from "@/hooks/useTheme";

interface ReferralSourceStepProps {
  selected: string;
  onSelect: (value: string) => void;
  onNext: () => void;
}

const SOURCES = [
  { id: "instagram", label: "Instagram", icon: "logo-instagram" as const, color: "#FF5A8A" },
  { id: "tiktok", label: "TikTok", icon: "logo-tiktok" as const, color: "#F4F7FB" },
  { id: "youtube", label: "YouTube", icon: "logo-youtube" as const, color: "#FF3B30" },
  { id: "google", label: "Google Search", icon: "logo-google" as const, color: "#4285F4" },
  { id: "friend", label: "Friend or Family", icon: "chatbubble-outline" as const, color: palette.orange },
  { id: "other", label: "Other", icon: "ellipsis-horizontal" as const, color: "#F4F7FB" },
];

export default function ReferralSourceStep({
  selected,
  onSelect,
  onNext,
}: ReferralSourceStepProps) {
  const C = useTheme();
  const s = makeStyles(C);

  const handleSelect = (value: string) => {
    void Haptics.selectionAsync();
    onSelect(value);
  };

  return (
    <View style={s.container}>
      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={s.hero}>
          <Image
            source={require("@/assets/images/onboarding/referral-hero.png")}
            style={s.heroImage}
            resizeMode="contain"
            accessibilityLabel="A paper plane discovering 1Per through different paths"
          />
        </View>

        <View style={s.header}>
          <Text style={s.headline}>
            Where did you{"\n"}hear about <Text style={s.highlight}>1Per</Text>?
          </Text>
        </View>

        <View style={s.list}>
          {SOURCES.map((source) => {
            const isSelected = selected === source.id;
            return (
              <TouchableOpacity
                key={source.id}
                style={[s.row, isSelected && s.rowSelected]}
                onPress={() => handleSelect(source.id)}
                activeOpacity={0.78}
              >
                <Ionicons name={source.icon} size={25} color={source.color} />
                <Text style={s.sourceLabel}>{source.label}</Text>
                <Ionicons
                  name={isSelected ? "checkmark-circle" : "ellipse-outline"}
                  size={24}
                  color={isSelected ? palette.orange : C.textQuaternary}
                />
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>

      <TouchableOpacity
        style={[s.btn, !selected && s.btnDisabled]}
        onPress={selected ? onNext : undefined}
        disabled={!selected}
        activeOpacity={0.85}
      >
        <Text style={s.btnText}>Continue</Text>
      </TouchableOpacity>
    </View>
  );
}

function makeStyles(C: ReturnType<typeof import("@/hooks/useTheme").useTheme>) {
  return StyleSheet.create({
    container: {
      flex: 1,
      paddingBottom: 32,
      justifyContent: "space-between",
    },
    scroll: {
      flex: 1,
    },
    content: {
      paddingHorizontal: 24,
      paddingTop: 8,
      paddingBottom: 18,
      gap: 16,
    },
    hero: {
      height: 132,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 2,
    },
    heroImage: {
      width: "100%",
      height: "100%",
    },
    plane: {
      transform: [{ rotate: "-8deg" }],
    },
    socialBubble: {
      position: "absolute",
      width: 46,
      height: 46,
      borderRadius: 23,
      backgroundColor: C.cardBg,
      borderWidth: 1,
      borderColor: C.cardBorder,
      alignItems: "center",
      justifyContent: "center",
    },
    instagramBubble: {
      left: 52,
      top: 2,
    },
    tiktokBubble: {
      right: 54,
      top: 8,
    },
    youtubeBubble: {
      left: 54,
      bottom: 16,
    },
    searchBubble: {
      right: 52,
      bottom: 10,
    },
    header: {
      gap: 8,
    },
    headline: {
      color: C.textPrimary,
      fontSize: 30,
      fontWeight: "800",
      lineHeight: 36,
    },
    highlight: {
      color: palette.orange,
    },
    body: {
      color: C.textSecondary,
      fontSize: 16,
      lineHeight: 24,
      maxWidth: 320,
    },
    list: {
      gap: 7,
    },
    row: {
      minHeight: 52,
      borderRadius: 14,
      borderCurve: "continuous",
      borderWidth: 1,
      borderColor: C.cardBorder,
      backgroundColor: C.cardBg,
      paddingHorizontal: 16,
      flexDirection: "row",
      alignItems: "center",
      gap: 14,
    },
    rowSelected: {
      borderColor: palette.orange,
      backgroundColor: C.accentBgSubtle,
    },
    sourceLabel: {
      flex: 1,
      color: C.textPrimary,
      fontSize: 15,
      fontWeight: "600",
    },
    btn: {
      backgroundColor: palette.orange,
      borderRadius: 14,
      paddingVertical: 18,
      alignItems: "center",
      marginHorizontal: 24,
    },
    btnDisabled: {
      opacity: 0.35,
    },
    btnText: {
      color: "#fff",
      fontSize: 16,
      fontWeight: "700",
    },
  });
}
