import { useTheme } from "@/hooks/useTheme";
import { StyleSheet, View } from "react-native";

interface GradientBackgroundProps {
  variant?: "default" | "onboarding";
}

export default function GradientBackground({ variant = "default" }: GradientBackgroundProps) {
  const C = useTheme();
  return (
    <View
      style={[StyleSheet.absoluteFill, { backgroundColor: variant === "onboarding" ? C.heroBg : C.screenBg }]}
      pointerEvents="none"
    />
  );
}
