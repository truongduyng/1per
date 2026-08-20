import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Alert, Image, Text, TouchableOpacity, View, StyleSheet } from "react-native";

import { palette } from "@/constants/theme";
import { useTheme } from "@/hooks/useTheme";
import { signInAndSync } from "@/lib/cloudSync";

export function BackupStep({ onNext }: { onNext: () => void }) {
  const C = useTheme();
  const s = makeStyles(C);
  const [isSigningIn, setIsSigningIn] = React.useState(false);

  const handleSignIn = async () => {
    setIsSigningIn(true);
    try {
      const { restored } = await signInAndSync();
      Alert.alert(
        restored ? "Data restored" : "Backup enabled",
        restored
          ? "We found a previous backup for this Apple account and restored it."
          : "Your data will be available after reinstalling the app.",
      );
      onNext();
    } catch (error) {
      console.error("Failed to enable cloud backup:", error);
      Alert.alert("Could not sign in", "You can continue and enable backup later in Settings.");
    } finally {
      setIsSigningIn(false);
    }
  };

  return (
    <View style={s.container}>
      <View style={s.content}>
        <View style={s.iconWrap}>
          <Image
            source={require("@/assets/images/onboarding/cloud-backup-hero.png")}
            style={s.heroImage}
            resizeMode="contain"
            accessibilityLabel="Cloud backup illustration"
          />
        </View>

        <View>
          <Text style={s.headline}>
            Giữ lại những gì bạn đã <Text style={s.highlight}>xây dựng.</Text>
          </Text>
          <Text style={s.body}>
            Đăng nhập với Apple để bảo vệ hồ sơ, mục tiêu và tiến độ của bạn khi đổi máy hoặc cài lại ứng dụng.
          </Text>
        </View>

        <View style={s.benefitList}>
          <View style={s.benefitRow}>
            <View style={s.benefitIcon}>
              <Ionicons name="cloud-done-outline" size={27} color={palette.orange} />
            </View>
            <View style={s.benefitCopy}>
              <Text style={s.benefitTitle}>Dữ liệu luôn an toàn</Text>
              <Text style={s.benefitSubtitle}>Các mục tiêu và thói quen được sao lưu tự động.</Text>
            </View>
          </View>
          <View style={s.benefitRow}>
            <View style={s.benefitIcon}>
              <Ionicons name="phone-portrait-outline" size={27} color={palette.orange} />
            </View>
            <View style={s.benefitCopy}>
              <Text style={s.benefitTitle}>Tiếp tục hành trình</Text>
              <Text style={s.benefitSubtitle}>Khôi phục tiến độ khi bạn cài lại ứng dụng.</Text>
            </View>
          </View>
        </View>
      </View>

      <View style={s.footer}>
        <TouchableOpacity
          style={[s.btn, isSigningIn && s.btnDisabled]}
          onPress={handleSignIn}
          disabled={isSigningIn}
          activeOpacity={0.85}
        >
          <Text style={s.btnText}>{isSigningIn ? "Đang đăng nhập…" : "Đăng nhập với Apple"}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onNext} activeOpacity={0.7} hitSlop={12}>
          <Text style={s.skipText}>Để sau</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function makeStyles(C: ReturnType<typeof useTheme>) {
  return StyleSheet.create({
    container: { flex: 1, paddingHorizontal: 24, justifyContent: "space-between", paddingBottom: 32 },
    content: { flex: 1, justifyContent: "center", gap: 26, paddingBottom: 20 },
    iconWrap: { alignItems: "center" },
    heroImage: { width: 190, height: 190 },
    headline: { fontSize: 30, fontWeight: "800", color: C.textPrimary, lineHeight: 38 },
    highlight: { color: palette.orange },
    body: { fontSize: 16, color: C.textSecondary, lineHeight: 24, marginTop: 8 },
    benefitList: { gap: 12 },
    benefitRow: {
      flexDirection: "row", alignItems: "center", gap: 14,
      backgroundColor: C.cardBg, borderWidth: 1, borderColor: C.cardBorder,
      borderRadius: 14, borderCurve: "continuous", paddingHorizontal: 16, paddingVertical: 14,
    },
    benefitIcon: { width: 54, height: 54, borderRadius: 14, alignItems: "center", justifyContent: "center" },
    benefitCopy: { flex: 1, gap: 2 },
    benefitTitle: { color: C.textPrimary, fontSize: 15, fontWeight: "700" },
    benefitSubtitle: { color: C.textSecondary, fontSize: 13, lineHeight: 18 },
    footer: { alignItems: "center", gap: 18 },
    btn: {
      width: "100%", minHeight: 56, borderRadius: 8, backgroundColor: C.accent,
      alignItems: "center", justifyContent: "center", borderWidth: 1,
      borderColor: "rgba(255,255,255,0.14)", shadowColor: C.accent,
      shadowOpacity: 0.24, shadowRadius: 18, shadowOffset: { width: 0, height: 8 },
    },
    btnDisabled: { opacity: 0.6 },
    btnText: { color: "#fff", fontSize: 16, fontWeight: "800" },
    skipText: { color: C.textSecondary, fontSize: 15, fontWeight: "600" },
  });
}
