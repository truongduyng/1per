import React from "react";
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { palette } from "@/constants/theme";
import { useTheme } from "@/hooks/useTheme";
import { registerForPushNotificationsAsync } from "@/lib/notifications";

interface NotificationStepProps {
  onNext: () => void;
}

const BENEFITS = [
  {
    icon: "notifications-outline" as const,
    title: "Focus reminders",
    subtitle: "Stay consistent with gentle nudges.",
  },
  {
    icon: "partly-sunny-outline" as const,
    title: "Daily motivation",
    subtitle: "Start your day with clarity.",
  },
  {
    icon: "moon-outline" as const,
    title: "Evening reflections",
    subtitle: "End your day with purpose.",
  },
];

export default function NotificationStep({ onNext }: NotificationStepProps) {
  const C = useTheme();
  const s = makeStyles(C);

  const handleEnable = async () => {
    await registerForPushNotificationsAsync();
    onNext();
  };

  return (
    <View style={s.container}>
      <View style={s.content}>
        <View style={s.iconWrap}>
          <Image
            source={require("@/assets/images/onboarding/notification-hero.png")}
            style={s.heroImage}
            resizeMode="contain"
            accessibilityLabel="A gentle reminder bell with morning and evening symbols"
          />
        </View>

        <View>
          <Text style={s.headline}>
            Stay on track{" "}
            <Text style={s.highlight}>without</Text> the noise
          </Text>
          <Text style={s.body}>
            Enable notifications to get gentle reminders, daily focus nudges,
            and evening reflections.
          </Text>
        </View>

        <View style={s.benefitList}>
          {BENEFITS.map((item) => (
            <View
              key={item.title}
              style={s.benefitRow}
            >
              <View style={s.benefitIcon}>
                <Ionicons name={item.icon} size={28} color={palette.orange} />
              </View>
              <View style={s.benefitCopy}>
                <Text style={s.benefitTitle}>{item.title}</Text>
                <Text style={s.benefitSubtitle}>{item.subtitle}</Text>
              </View>
            </View>
          ))}
        </View>
      </View>

      <View style={s.footer}>
        <TouchableOpacity style={s.btn} onPress={handleEnable} activeOpacity={0.85}>
          <Text style={s.btnText}>Enable notifications</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onNext} activeOpacity={0.7} hitSlop={12}>
          <Text style={s.skipText}>Maybe later</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function makeStyles(C: ReturnType<typeof import("@/hooks/useTheme").useTheme>) {
  return StyleSheet.create({
    container: {
      flex: 1,
      paddingHorizontal: 24,
      justifyContent: "space-between",
      paddingBottom: 32,
    },
    content: {
      flex: 1,
      justifyContent: "center",
      gap: 28,
      paddingBottom: 20,
    },
    iconWrap: {
      alignItems: "center",
    },
    heroImage: {
      width: 132,
      height: 132,
    },
    iconCircle: {
      width: 96,
      height: 96,
      borderRadius: 32,
      borderCurve: "continuous",
      backgroundColor: C.accentBg,
      borderWidth: 1.5,
      borderColor: C.accentBorder,
      alignItems: "center",
      justifyContent: "center",
    },
    headline: {
      fontSize: 30,
      fontWeight: "800",
      color: C.textPrimary,
      lineHeight: 38,
    },
    highlight: {
      color: palette.orange,
    },
    body: {
      fontSize: 16,
      color: C.textSecondary,
      lineHeight: 24,
      marginTop: 8,
    },
    benefitList: {
      gap: 12,
    },
    benefitRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 14,
      backgroundColor: C.cardBg,
      borderWidth: 1,
      borderColor: C.cardBorder,
      borderRadius: 14,
      borderCurve: "continuous",
      paddingHorizontal: 16,
      paddingVertical: 14,
    },
    benefitIcon: {
      width: 54,
      height: 54,
      borderRadius: 14,
      borderCurve: "continuous",
      alignItems: "center",
      justifyContent: "center",
    },
    benefitCopy: {
      flex: 1,
      gap: 2,
    },
    benefitTitle: {
      color: C.textPrimary,
      fontSize: 15,
      fontWeight: "700",
    },
    benefitSubtitle: {
      color: C.textSecondary,
      fontSize: 13,
      lineHeight: 18,
    },
    footer: {
      gap: 14,
      alignItems: "center",
    },
    btn: {
      backgroundColor: palette.orange,
      borderRadius: 14,
      paddingVertical: 18,
      alignItems: "center",
      width: "100%",
    },
    btnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
    skipText: {
      color: C.textTertiary,
      fontSize: 14,
      fontWeight: "600",
    },
  });
}
