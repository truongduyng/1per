import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Text, View } from "react-native";

import { useTheme } from "@/hooks/useTheme";
import { DEFAULT_HARM, PAIN_HARM } from "./data";
import { ScreenShell } from "./shared";
import { makeStyles } from "./theme";

export function PainAmplifyScreen({
  painPoints,
  onNext,
}: {
  painPoints: string[];
  onNext: () => void;
}) {
  const C = useTheme();
  const s = makeStyles(C);

  const items = painPoints.slice(0, 3).map((pain) => ({
    pain,
    ...(PAIN_HARM[pain] ?? DEFAULT_HARM),
  }));

  const headline = items.length === 1
    ? "This one thing is costing you more than you think."
    : "These patterns are costing you more than you think.";

  return (
    <ScreenShell onNext={onNext} cta="I'm ready to fix this" scroll>
      <View style={s.copyBlock}>
        <Text style={s.headline}>{headline}</Text>
        <Text style={s.body}>Left unaddressed, small friction becomes a permanent ceiling.</Text>
      </View>
      <View style={s.amplifyList}>
        {items.map(({ pain, harm, cost }) => (
          <View key={pain} style={s.amplifyCard}>
            <View style={s.amplifyPainRow}>
              <Ionicons name="alert-circle" size={14} color={C.accentText} />
              <Text style={s.amplifyPainText}>{pain}</Text>
            </View>
            <Text style={s.amplifyHarm}>{harm}</Text>
            <View style={s.amplifyCostRow}>
              <Ionicons name="trending-down-outline" size={13} color="rgba(255,80,80,0.7)" />
              <Text style={s.amplifyCost}>{cost}</Text>
            </View>
          </View>
        ))}
      </View>
    </ScreenShell>
  );
}
