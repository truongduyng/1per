import React, { useEffect, useMemo } from "react";
import { Animated, Easing, Text, useAnimatedValue, View } from "react-native";

import { useTheme } from "@/hooks/useTheme";
import { ScreenShell } from "./shared";
import { makeStyles } from "./theme";

export function HookScreen({ onNext }: { onNext: () => void }) {
  const C = useTheme();
  const s = makeStyles(C);
  return (
    <ScreenShell onNext={onNext}>
      <View style={s.heroVisual}>
        <View style={s.heroGlow} />
        {["Daily focus", "Habits", "Routines", "Streaks", "App lock"].map((tag, index) => (
          <FloatingTag key={tag} label={tag} index={index} />
        ))}
        <View style={s.hillBack} />
        <View style={s.hillFront} />
        <View style={s.sun} />
      </View>
      <View style={s.copyBlock}>
        <Text style={s.headline}>Become someone who keeps promises to yourself.</Text>
        <Text style={s.body}>Start with one hard thing. End with a reset. Let small wins compound.</Text>
      </View>
    </ScreenShell>
  );
}

function FloatingTag({ label, index }: { label: string; index: number }) {
  const C = useTheme();
  const s = makeStyles(C);
  const drift = useAnimatedValue(0);

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(drift, {
          toValue: 1,
          duration: 3400 + index * 360,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(drift, {
          toValue: 0,
          duration: 3400 + index * 360,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    ).start();
  }, [drift, index]);

  const { translateY, translateX } = useMemo(
    () => ({
      translateY: drift.interpolate({ inputRange: [0, 1], outputRange: [0, -9] }),
      translateX: drift.interpolate({ inputRange: [0, 1], outputRange: [0, index % 2 ? -6 : 6] }),
    }),
    [drift, index],
  );
  const positions = [
    { top: 26, left: 58 },
    { top: 78, left: 18 },
    { top: 132, left: 38 },
    { top: 104, right: 38 },
    { top: 158, right: 68 },
  ];

  return (
    <Animated.View
      style={[s.floatingTag, positions[index], { transform: [{ translateX }, { translateY }] }]}
    >
      <View style={s.tagDot} />
      <Text style={s.floatingTagText}>{label}</Text>
    </Animated.View>
  );
}
