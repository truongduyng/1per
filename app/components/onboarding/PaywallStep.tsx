import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Image,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Purchases, { type PurchasesPackage } from "react-native-purchases";
import { useRevenueCat } from "@/hooks/useRevenueCat";
import { trackOnboardingEvent } from "@/hooks/useOnboarding";
import { palette } from "@/constants/theme";
import { useTheme } from "@/hooks/useTheme";

const PRIVACY_URL = "https://yikudo.xyz/1per/privacy";
const TERMS_URL = "https://yikudo.xyz/1per/terms";

const FEATURES = [
  { icon: "infinite-outline" as const, text: "Unlimited custom habits" },
  { icon: "grid-outline" as const, text: "Full habit history & heatmap" },
  { icon: "flag-outline" as const, text: "Daily focus goal tracking" },
  { icon: "moon-outline" as const, text: "Evening reset & routines" },
];

interface PaywallStepProps {
  onComplete: () => void;
}

function isAnnualPackage(pkg: PurchasesPackage) {
  return (
    pkg.packageType === "ANNUAL" ||
    pkg.product.identifier.toLowerCase().includes("annual") ||
    pkg.product.identifier.toLowerCase().includes("yearly")
  );
}

function isLifetimePackage(pkg: PurchasesPackage) {
  return (
    pkg.packageType === "LIFETIME" ||
    pkg.product.identifier.toLowerCase().includes("lifetime")
  );
}

function packageWeeks(pkg: PurchasesPackage): number {
  const type = pkg.packageType;
  if (type === "ANNUAL") return 52;
  if (type === "SIX_MONTH") return 26;
  if (type === "THREE_MONTH") return 13;
  if (type === "TWO_MONTH") return 8.67;
  if (type === "MONTHLY") return 4.33;
  if (type === "WEEKLY") return 1;
  const id = pkg.product.identifier.toLowerCase();
  if (id.includes("annual") || id.includes("yearly")) return 52;
  if (id.includes("quarterly")) return 13;
  if (id.includes("monthly")) return 4.33;
  return 0;
}

function packageLabel(pkg: PurchasesPackage): string {
  const type = pkg.packageType;
  if (type === "ANNUAL") return "Yearly";
  if (type === "SIX_MONTH") return "6 Months";
  if (type === "THREE_MONTH") return "3 Months";
  if (type === "TWO_MONTH") return "2 Months";
  if (type === "MONTHLY") return "Monthly";
  if (type === "WEEKLY") return "Weekly";
  if (type === "LIFETIME") return "Lifetime";
  const id = pkg.product.identifier.toLowerCase();
  if (id.includes("annual") || id.includes("yearly")) return "Yearly";
  if (id.includes("quarterly")) return "Quarterly";
  if (id.includes("monthly")) return "Monthly";
  if (id.includes("weekly")) return "Weekly";
  return "";
}

export default function PaywallStep({ onComplete }: PaywallStepProps) {
  const C = useTheme();
  const s = makeStyles(C);
  const { currentOffering, isLoading, refreshCustomerInfo } = useRevenueCat();
  const [purchasing, setPurchasing] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const packages = currentOffering?.availablePackages ?? [];

  const weeklyPkg = packages.find((p) => p.packageType === "WEEKLY");
  const weeklyPricePerWeek = weeklyPkg ? weeklyPkg.product.price : null;

  const annualPkg = packages.find(isAnnualPackage);
  const [selectedPkg, setSelectedPkg] = useState<PurchasesPackage | null>(null);

  const effectiveSelected = selectedPkg ?? annualPkg ?? packages[0] ?? null;

  React.useEffect(() => {
    trackOnboardingEvent("paywall_viewed");
  }, []);

  const handlePurchase = async () => {
    if (!effectiveSelected) return;
    setError(null);
    setPurchasing(true);
    trackOnboardingEvent("trial_started", {
      package: effectiveSelected.identifier,
      product: effectiveSelected.product.identifier,
    });
    try {
      await Purchases.purchasePackage(effectiveSelected);
      await refreshCustomerInfo();
      trackOnboardingEvent("subscription_purchased", {
        package: effectiveSelected.identifier,
        product: effectiveSelected.product.identifier,
      });
      onComplete();
    } catch (e: any) {
      if (!e.userCancelled) {
        setError("Purchase failed. Please try again.");
      }
    } finally {
      setPurchasing(false);
    }
  };

  const handleRestore = async () => {
    setError(null);
    setRestoring(true);
    try {
      const info = await Purchases.restorePurchases();
      const hasAccess = typeof info.entitlements.active["full"] !== "undefined";
      if (hasAccess) {
        await refreshCustomerInfo();
        onComplete();
      } else {
        setError("No previous purchase found.");
      }
    } catch {
      setError("Restore failed. Please try again.");
    } finally {
      setRestoring(false);
    }
  };

  const busy = purchasing || restoring;
  const isSelectedAnnual = effectiveSelected
    ? isAnnualPackage(effectiveSelected)
    : false;
  const isSelectedLifetime = effectiveSelected
    ? isLifetimePackage(effectiveSelected)
    : false;
  const ctaLabel = isSelectedLifetime
    ? "Change my life, forever"
    : "Start changing my life";

  return (
    <ScrollView
      style={s.scroll}
      contentContainerStyle={s.container}
      showsVerticalScrollIndicator={false}
    >
      <Image
        source={require("@/assets/images/onboarding/paywall-hero.png")}
        style={s.heroImage}
        resizeMode="contain"
        accessibilityLabel="A shield protecting lasting momentum"
      />
      <View style={s.header}>
        <Text style={s.headline}>Protect your momentum</Text>
        <Text style={s.sub}>
          Go further with 1Per Full Access. Unlock all features and support the
          app.
        </Text>
      </View>

      <View style={s.featureList}>
        {FEATURES.map((f) => (
          <View key={f.text} style={s.featureRow}>
            <View style={s.featureIcon}>
              <Ionicons name={f.icon} size={18} color={palette.orange} />
            </View>
            <Text style={s.featureText}>{f.text}</Text>
          </View>
        ))}
      </View>

      {error ? (
        <View style={s.errorBox}>
          <Text style={s.errorText}>{error}</Text>
        </View>
      ) : null}

      {isLoading ? (
        <ActivityIndicator color={palette.orange} style={s.loader} />
      ) : packages.length === 0 ? (
        <View style={s.noOfferingBox}>
          <Text style={s.noOfferingText}>
            Pricing unavailable. Continue to the app and subscribe from
            Settings.
          </Text>
        </View>
      ) : (
        <>
          <View style={s.packages}>
            {packages.map((pkg) => {
              const { product } = pkg;
              const isAnnual = isAnnualPackage(pkg);
              const isLifetime = isLifetimePackage(pkg);
              const isSelected =
                effectiveSelected?.identifier === pkg.identifier;
              const weeks = packageWeeks(pkg);
              const perWeek =
                !isLifetime && weeks > 0 ? product.price / weeks : null;
              const perWeekStr = perWeek
                ? perWeek.toLocaleString("en-US", {
                    style: "currency",
                    currency: product.currencyCode,
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })
                : null;
              const savingsPct =
                !isLifetime &&
                weeklyPricePerWeek &&
                weeks > 1 &&
                pkg.packageType !== "WEEKLY"
                  ? Math.round(
                      (1 - product.price / weeks / weeklyPricePerWeek) * 100,
                    )
                  : null;
              return (
                <TouchableOpacity
                  key={pkg.identifier}
                  style={[s.pkgCard, isSelected && s.pkgCardSelected]}
                  onPress={() => setSelectedPkg(pkg)}
                  disabled={busy}
                  activeOpacity={0.8}
                >
                  <View style={s.pkgRow}>
                    <Ionicons
                      name={isSelected ? "checkmark-circle" : "ellipse-outline"}
                      size={20}
                      color={isSelected ? palette.orange : C.textQuaternary}
                    />
                    <View style={s.pkgInfo}>
                      <View style={s.pkgTitleRow}>
                        <Text
                          style={[s.pkgTitle, isSelected && s.pkgTitleSelected]}
                        >
                          {packageLabel(pkg)}
                        </Text>
                        {isLifetime || isAnnual ? (
                          <View style={s.bestValueBadge}>
                            <Text style={s.bestValueText}>
                              {isLifetime ? "One-time" : "Best value"}
                            </Text>
                          </View>
                        ) : null}
                        {isLifetime ? (
                          <Text style={s.pkgTrial}>
                            Pay once, yours forever
                          </Text>
                        ) : isAnnual ? (
                          <Text style={s.pkgTrial}>3-day free trial</Text>
                        ) : null}
                      </View>
                    </View>
                    <View style={s.pkgPriceCol}>
                      <Text
                        style={[s.pkgPrice, isSelected && s.pkgPriceSelected]}
                      >
                        {product.priceString}
                      </Text>
                      <View style={s.pkgPriceSubRow}>
                        {perWeekStr ? (
                          <Text style={s.pkgPerWeek}>{perWeekStr}/wk</Text>
                        ) : null}
                        {savingsPct && savingsPct > 0 ? (
                          <View style={s.savingsBadge}>
                            <Text style={s.savingsText}>-{savingsPct}%</Text>
                          </View>
                        ) : null}
                      </View>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>

          <TouchableOpacity
            style={[s.ctaBtn, busy && s.ctaBtnDisabled]}
            onPress={handlePurchase}
            disabled={busy}
            activeOpacity={0.85}
          >
            {purchasing ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={s.ctaBtnText}>{ctaLabel}</Text>
            )}
          </TouchableOpacity>
          {isSelectedAnnual && !isSelectedLifetime ? (
            <Text style={s.pkgNoPayment}>No payment due now</Text>
          ) : null}
        </>
      )}

      <TouchableOpacity
        style={s.restoreBtn}
        onPress={handleRestore}
        disabled={busy}
      >
        {restoring ? (
          <ActivityIndicator color={palette.orange} size="small" />
        ) : (
          <Text style={s.restoreText}>Restore purchase</Text>
        )}
      </TouchableOpacity>

      <View style={s.legalRow}>
        <Text style={s.legal}>Auto-renews unless cancelled. </Text>
        <TouchableOpacity onPress={() => Linking.openURL(TERMS_URL)}>
          <Text style={s.legalLink}>Terms</Text>
        </TouchableOpacity>
        <Text style={s.legal}> & </Text>
        <TouchableOpacity onPress={() => Linking.openURL(PRIVACY_URL)}>
          <Text style={s.legalLink}>Privacy</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

function makeStyles(C: ReturnType<typeof useTheme>) {
  return StyleSheet.create({
    scroll: { flex: 1 },
    container: {
      paddingHorizontal: 24,
      paddingBottom: 32,
      gap: 14,
    },
    header: { gap: 6, paddingTop: 4 },
    heroImage: {
      width: "100%",
      height: 150,
      marginBottom: -4,
    },
    proBadge: {
      alignSelf: "flex-start",
      backgroundColor: palette.orange,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 5,
      marginBottom: 4,
    },
    proBadgeText: {
      color: "#080808",
      fontSize: 12,
      fontWeight: "800",
      letterSpacing: 0,
    },
    badge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      alignSelf: "flex-start",
      backgroundColor: C.accentBg,
      borderWidth: 1,
      borderColor: C.accentBorder,
      borderRadius: 20,
      paddingHorizontal: 10,
      paddingVertical: 4,
    },
    badgeText: {
      fontSize: 12,
      fontWeight: "700",
      color: palette.orange,
    },
    headline: {
      fontSize: 26,
      fontWeight: "800",
      color: C.textPrimary,
      lineHeight: 31,
    },
    sub: {
      fontSize: 14,
      color: C.textTertiary,
      lineHeight: 19,
    },
    featureList: {
      backgroundColor: C.cardBg,
      borderWidth: 1,
      borderColor: C.cardBorder,
      borderRadius: 16,
      padding: 16,
      gap: 13,
    },
    featureRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
    },
    featureIcon: {
      width: 34,
      height: 34,
      borderRadius: 10,
      backgroundColor: C.accentBg,
      alignItems: "center",
      justifyContent: "center",
    },
    featureText: {
      fontSize: 15,
      fontWeight: "500",
      color: C.text,
    },
    packages: { gap: 8 },
    pkgCard: {
      backgroundColor: C.cardBg,
      borderWidth: 1.5,
      borderColor: C.cardBorder,
      borderRadius: 14,
      paddingHorizontal: 14,
      paddingVertical: 12,
    },
    pkgCardSelected: {
      borderColor: palette.orange,
      backgroundColor: C.accentBgSubtle,
    },
    pkgRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    pkgInfo: { flex: 1, gap: 4 },
    pkgTitleRow: {
      flexDirection: "row",
      alignItems: "center",
      flexWrap: "wrap",
      gap: 6,
    },
    pkgPriceCol: {
      alignItems: "flex-end",
      gap: 2,
    },
    pkgPriceSubRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    pkgTitleSelected: { color: C.textPrimary },
    pkgPriceSelected: { color: palette.orange },
    ctaBtn: {
      backgroundColor: palette.orange,
      borderRadius: 14,
      paddingVertical: 15,
      alignItems: "center",
    },
    ctaBtnDisabled: { opacity: 0.6 },
    ctaBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
    bestValueBadge: {
      alignSelf: "flex-start",
      backgroundColor: palette.orange,
      borderRadius: 8,
      paddingHorizontal: 8,
      paddingVertical: 2,
    },
    bestValueText: {
      fontSize: 11,
      fontWeight: "700",
      color: "#fff",
    },
    pkgTitle: {
      fontSize: 15,
      fontWeight: "700",
      color: C.textSecondary,
    },
    pkgPrice: {
      fontSize: 17,
      fontWeight: "800",
      color: C.textPrimary,
    },
    pkgPerWeek: {
      fontSize: 12,
      color: C.textTertiary,
    },
    savingsBadge: {
      backgroundColor: "rgba(76,175,80,0.15)",
      borderRadius: 6,
      paddingHorizontal: 6,
      paddingVertical: 2,
    },
    savingsText: {
      fontSize: 11,
      fontWeight: "700" as const,
      color: "#4caf50",
    },
    pkgTrial: {
      fontSize: 12,
      fontWeight: "700" as const,
      color: palette.orange,
    },
    pkgNoPayment: {
      fontSize: 12,
      fontWeight: "600" as const,
      color: C.textTertiary,
      textAlign: "center" as const,
      marginTop: -4,
    },
    errorBox: {
      backgroundColor: "rgba(255,60,60,0.1)",
      borderRadius: 12,
      padding: 12,
      borderWidth: 1,
      borderColor: "rgba(255,60,60,0.25)",
    },
    errorText: {
      color: "#ff6060",
      fontSize: 13,
      textAlign: "center",
    },
    noOfferingBox: {
      backgroundColor: C.cardBg,
      borderRadius: 12,
      padding: 16,
      borderWidth: 1,
      borderColor: C.cardBorder,
    },
    noOfferingText: {
      color: C.textTertiary,
      fontSize: 13,
      textAlign: "center",
      lineHeight: 19,
    },
    billingDisclosure: {
      fontSize: 11,
      color: C.textQuaternary,
      textAlign: "center",
      lineHeight: 16,
      marginTop: -8,
    },
    loader: { alignSelf: "center" },
    restoreBtn: {
      alignSelf: "center",
      paddingVertical: 8,
    },
    restoreText: {
      fontSize: 14,
      color: C.textTertiary,
      textDecorationLine: "underline",
    },
    legalRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      flexWrap: "wrap",
    },
    legal: {
      fontSize: 11,
      color: C.textQuaternary,
      lineHeight: 16,
    },
    legalLink: {
      fontSize: 11,
      color: C.textTertiary,
      lineHeight: 16,
      textDecorationLine: "underline",
    },
  });
}
