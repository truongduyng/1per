import React, { useState } from "react";
import { Image, Text, TouchableOpacity, View, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { palette } from "@/constants/theme";
import { useTheme } from "@/hooks/useTheme";
import {
  APP_BLOCKER_SELECTION_ID,
  AppBlockerSelectionSheet,
  appBlocker,
  type AppBlockerSelectionMetadata,
  type AppBlockerSelectionSummary,
} from "@/lib/appBlocker";

interface ScreenTimeStepProps {
  onNext: () => void;
}

const BENEFITS = [
  {
    icon: "lock-closed-outline" as const,
    title: "Block doomscroll apps",
    subtitle: "Instagram, TikTok, YouTube - locked until your habits are done.",
  },
  {
    icon: "checkmark-circle-outline" as const,
    title: "Earn your unlock",
    subtitle: "Apps stay shielded until you finish your main task and habits.",
  },
];

export default function ScreenTimeStep({ onNext }: ScreenTimeStepProps) {
  const C = useTheme();
  const s = makeStyles(C);

  const [status, setStatus] = useState("Pick apps to block during focus time.");
  const [selection, setSelection] = useState<AppBlockerSelectionSummary>({
    supported: appBlocker.isSupported,
  });
  const [showPicker, setShowPicker] = useState(false);

  const hasSelection = Boolean(selection.hasSelection);

  const handleSetUp = async () => {
    if (!appBlocker.isSupported) {
      setStatus("Screen Time requires an iOS development build.");
      return;
    }

    try {
      setStatus("Requesting Screen Time access...");
      await appBlocker.requestAuthorization();
      setStatus("Choose apps to block");
      setShowPicker(true);
    } catch {
      setStatus("Screen Time permission denied");
    }
  };

  const handleSelectionChange = (metadata: AppBlockerSelectionMetadata) => {
    const next = {
      supported: appBlocker.isSupported,
      applicationCount: metadata.applicationCount,
      categoryCount: metadata.categoryCount,
      webDomainCount: metadata.webDomainCount,
      hasSelection:
        metadata.applicationCount + metadata.categoryCount + metadata.webDomainCount > 0,
    };
    setSelection(next);
    setStatus(next.hasSelection ? "Selection saved" : "No apps selected");
  };

  const handlePickerDismiss = async () => {
    setShowPicker(false);
    try {
      const summary = await appBlocker.getSelectionSummary();
      setSelection(summary);
      setStatus(summary.hasSelection ? "Apps selected - locked for now" : "No apps selected");
    } catch {
      setStatus("Screen Time setup failed");
    }
  };

  return (
    <View style={s.container}>
      <View style={s.content}>
        <View style={s.iconWrap}>
          <Image
            source={require("@/assets/images/onboarding/screentime-hero.png")}
            style={s.heroImage}
            resizeMode="contain"
            accessibilityLabel="A phone protected by a focus shield"
          />
        </View>

        <View>
          <Text style={s.headline}>
            Lock the apps{"\n"}
            <Text style={s.highlight}>that steal</Text> your time.
          </Text>
          <Text style={s.body}>
            Choose distracting apps with Apple&apos;s Screen Time picker. They&apos;ll stay
            shielded until you finish your daily focus and habits.
          </Text>
        </View>

        <View style={s.benefitList}>
          {BENEFITS.map((item) => (
            <View key={item.title} style={s.benefitRow}>
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

        {hasSelection && (
          <View style={s.statusRow}>
            <Ionicons name="checkmark-circle" size={18} color={palette.orange} />
            <Text style={s.statusText}>{status}</Text>
          </View>
        )}

        {showPicker && (
          <AppBlockerSelectionSheet
            familyActivitySelectionId={APP_BLOCKER_SELECTION_ID}
            onDismissRequest={handlePickerDismiss}
            onSelectionChange={(event) => handleSelectionChange(event.nativeEvent)}
            style={s.pickerAnchor}
          />
        )}
      </View>

      <View style={s.footer}>
        {hasSelection ? (
          <>
            <TouchableOpacity style={s.btn} onPress={onNext} activeOpacity={0.85}>
              <Text style={s.btnText}>Continue</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleSetUp} activeOpacity={0.7} hitSlop={12}>
              <Text style={s.skipText}>Change blocked apps</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <TouchableOpacity style={s.btn} onPress={handleSetUp} activeOpacity={0.85}>
              <Text style={s.btnText}>Set up Screen Time lock</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onNext} activeOpacity={0.7} hitSlop={12}>
              <Text style={s.skipText}>Maybe later</Text>
            </TouchableOpacity>
          </>
        )}
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
      gap: 24,
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
    statusRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingHorizontal: 4,
    },
    statusText: {
      color: C.textSecondary,
      fontSize: 13,
      fontWeight: "600",
      flex: 1,
    },
    pickerAnchor: {
      height: 0,
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
