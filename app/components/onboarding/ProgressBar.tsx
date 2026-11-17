import React from "react";
import { View, StyleSheet } from "react-native";
import { useTheme } from "@/hooks/useTheme";

interface ProgressBarProps {
  step: number;
  total: number;
  compact?: boolean;
}

export default function ProgressBar({ step, total, compact = false }: ProgressBarProps) {
  const C = useTheme();
  return (
    <View style={[styles.row, compact && styles.rowCompact]}>
      {Array.from({ length: total }).map((_, i) => {
        const filled = i < step;
        return (
          <View
            key={i}
            style={[
              styles.segment,
              { flex: 1 },
              { backgroundColor: filled ? C.accent : C.cardBorder },
              i < total - 1 && styles.gap,
            ]}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 4,
  },
  rowCompact: {
    paddingHorizontal: 0,
    paddingTop: 0,
    paddingBottom: 0,
  },
  segment: {
    height: 3,
    borderRadius: 2,
  },
  gap: {
    marginRight: 4,
  },
});
