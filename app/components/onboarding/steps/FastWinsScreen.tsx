import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Text, View } from "react-native";

import { useTheme } from "@/hooks/useTheme";
import { FAST_WINS } from "./data";
import { ScreenShell } from "./shared";
import { makeStyles } from "./theme";

export function FastWinsScreen({ onNext }: { onNext: () => void }) {
  const C = useTheme();
  const s = makeStyles(C);
  return (
    <ScreenShell onNext={onNext} scroll>
      <View style={s.copyBlock}>
        <Text style={s.headline}>Small steps.{"\n"}Big transformation.</Text>
        <Text style={s.body}>Here&apos;s what&apos;s possible.</Text>
      </View>
      <View style={s.cardList}>
        {FAST_WINS.map((win) => (
          <View key={win.title} style={s.timelineCard}>
            <View style={s.timelineIcon}>
              <Ionicons name={win.icon} size={24} color={C.accentText} />
            </View>
            <View style={s.flex}>
              <Text style={s.cardTitle}>{win.title}</Text>
              {win.lines.map((line) => (
                <Text key={line} style={s.smallLine}>
                  {line}
                </Text>
              ))}
            </View>
          </View>
        ))}
      </View>
    </ScreenShell>
  );
}
