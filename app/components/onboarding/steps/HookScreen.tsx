import React from "react";
import { Image, Text, TouchableOpacity, View } from "react-native";

import { useTheme } from "@/hooks/useTheme";
import { ScreenShell } from "./shared";
import { makeStyles } from "./theme";

export function HookScreen({
  onNext,
  onExistingAccount,
}: {
  onNext: () => void;
  onExistingAccount: () => void;
}) {
  const C = useTheme();
  const s = makeStyles(C);
  return (
    <ScreenShell onNext={onNext}>
      <View style={s.heroVisual}>
        <Image
          source={require("@/assets/images/onboarding/promise-kept.png")}
          style={s.heroIllustration}
          resizeMode="contain"
          accessibilityLabel="A growing flame with a checkmark, surrounded by habit symbols"
        />
      </View>
      <View style={s.copyBlock}>
        <Text style={s.headline}>Become someone who keeps promises to yourself.</Text>
        <Text style={s.body}>Start with one hard thing. End with a reset. Let small wins compound.</Text>
        <TouchableOpacity onPress={onExistingAccount} activeOpacity={0.7}>
          <Text style={s.existingAccount}>I already have an account</Text>
        </TouchableOpacity>
      </View>
    </ScreenShell>
  );
}
