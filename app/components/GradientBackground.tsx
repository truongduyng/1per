import { useTheme } from "@/hooks/useTheme";
import { StyleSheet, View } from "react-native";

interface GradientBackgroundProps {
  variant?: "default" | "onboarding";
}

export default function GradientBackground({ variant = "default" }: GradientBackgroundProps) {
  const C = useTheme();
  const isOnboarding = variant === "onboarding";

  if (!isOnboarding) {
    return <View style={[StyleSheet.absoluteFill, { backgroundColor: C.screenBg }]} />;
  }

  return (
    <View style={styles.onboardingRoot} pointerEvents="none">
      <View style={styles.vignette} />
    </View>
  );
}

const styles = StyleSheet.create({
  onboardingRoot: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "#16171A",
  },
  vignette: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(0,0,0,0.08)",
  },
});
