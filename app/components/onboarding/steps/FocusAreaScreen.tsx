import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Image, type ImageSourcePropType, Pressable, Text, View } from "react-native";

import { useTheme } from "@/hooks/useTheme";
import { PAIN_FOCUS_META, PAIN_FOCUS_ORDER } from "./data";
import { ScreenShell } from "./shared";
import { ORANGE, makeStyles } from "./theme";

const FOCUS_AREAS = PAIN_FOCUS_ORDER.map((focus) => ({
  key: focus,
  ...PAIN_FOCUS_META[focus],
}));

const FOCUS_ICONS = {
  mindset: require("@/assets/images/onboarding/focus-icons/mindset.png"),
  work: require("@/assets/images/onboarding/focus-icons/work.png"),
  health: require("@/assets/images/onboarding/focus-icons/health.png"),
  relations: require("@/assets/images/onboarding/focus-icons/relations.png"),
  creative: require("@/assets/images/onboarding/focus-icons/creative.png"),
  finance: require("@/assets/images/onboarding/focus-icons/finance.png"),
} satisfies Record<(typeof PAIN_FOCUS_ORDER)[number], ImageSourcePropType>;

export function FocusAreaScreen({
  selected,
  onToggle,
  onNext,
}: {
  selected: string[];
  onToggle: (area: string) => void;
  onNext: () => void;
}) {
  const C = useTheme();
  const s = makeStyles(C);
  return (
    <ScreenShell onNext={onNext} disabled={selected.length === 0}>
      <View style={s.copyBlock}>
        <Text style={s.headline}>What area of your life matters most now?</Text>
        <Text style={s.body}>Pick one. We&apos;ll tailor your starting system around it.</Text>
      </View>
      <View style={s.focusGrid}>
        {FOCUS_AREAS.map(({ key, label }) => {
          const active = selected.includes(key);
          return (
            <Pressable
              key={key}
              onPress={() => onToggle(key)}
              style={[s.focusCard, active && s.focusCardActive]}
            >
              <View style={[s.focusIconWrap, active && s.focusIconWrapActive]}>
                <Image
                  source={FOCUS_ICONS[key]}
                  style={[s.focusIcon, !active && s.focusIconInactive]}
                  resizeMode="contain"
                />
              </View>
              <Text style={[s.focusLabel, active && s.focusLabelActive]}>{label}</Text>
              {active && (
                <View style={s.focusCheck}>
                  <Ionicons name="checkmark-circle" size={16} color={ORANGE} />
                </View>
              )}
            </Pressable>
          );
        })}
      </View>
    </ScreenShell>
  );
}
