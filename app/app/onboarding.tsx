import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useEffect } from "react";
import {
  Animated,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import GradientBackground from "@/components/GradientBackground";
import {
  AppTourScreen,
  ChallengeSuggestionScreen,
  FastWinsScreen,
  FocusAreaScreen,
  FutureScreen,
  HookScreen,
  IdentityScreen,
  PAIN_POINT_SET,
  PainAmplifyScreen,
  PainScreen,
  TrustScreen,
} from "@/components/onboarding/steps";
import NotificationStep from "@/components/onboarding/NotificationStep";
import ScreenTimeStep from "@/components/onboarding/ScreenTimeStep";
import PaywallStep from "@/components/onboarding/PaywallStep";
import ProgressBar from "@/components/onboarding/ProgressBar";
import ReferralSourceStep from "@/components/onboarding/ReferralSourceStep";
import { palette } from "@/constants/theme";
import {
  STEPS,
  TOTAL,
  trackOnboardingEvent,
  useOnboarding,
} from "@/hooks/useOnboarding";

export default function OnboardingScreen() {
  const s = makeStyles();
  const {
    currentStep,
    fadeAnim,
    focusAreas,
    setFocusAreas,
    painPoints,
    setPainPoints,
    selectedChallengeId,
    setSelectedChallengeId,
    referralSource,
    setReferralSource,
    name,
    setName,
    avatar,
    setAvatar,
    goNext,
    goBack,
    showBack,
    completeOnboarding,
  } = useOnboarding();

  const step = STEPS[currentStep];

  useEffect(() => {
    const validPainPoints = painPoints.filter((pain) => PAIN_POINT_SET.has(pain));
    if (validPainPoints.length !== painPoints.length) {
      setPainPoints(validPainPoints);
    }
  }, [painPoints, setPainPoints]);

  const advance = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    goNext();
  };

  const toggleFocusArea = (area: string) => {
    setFocusAreas((current) => {
      const exists = current.includes(area);
      return exists ? [] : [area];
    });
  };

  const togglePain = (pain: string) => {
    setPainPoints((current) => {
      const validCurrent = current.filter((item) => PAIN_POINT_SET.has(item));
      const exists = validCurrent.includes(pain);
      const next = exists ? [] : [pain];
      if (!exists && next.includes(pain)) {
        trackOnboardingEvent("pain_selected", { pain, count: next.length });
      }
      return next;
    });
  };

  const selectReferralSource = (source: string) => {
    setReferralSource(source);
    trackOnboardingEvent("referral_source_selected", { source });
  };

  const renderStep = () => {
    switch (step.type) {
      case "hook":
        return <HookScreen onNext={advance} />;
      case "focus-area":
        return (
          <FocusAreaScreen
            selected={focusAreas}
            onToggle={toggleFocusArea}
            onNext={advance}
          />
        );
      case "pain":
        return (
          <PainScreen
            selected={painPoints}
            onToggle={togglePain}
            onNext={advance}
            focusAreas={focusAreas}
          />
        );
      case "pain-amplify":
        return <PainAmplifyScreen painPoints={painPoints} onNext={advance} />;
      case "trust":
        return <TrustScreen onNext={advance} />;
      case "future":
        return <FutureScreen onNext={advance} />;
      case "identity":
        return (
          <IdentityScreen
            name={name}
            avatar={avatar}
            onNameChange={setName}
            onAvatarChange={setAvatar}
            onNext={advance}
          />
        );
      case "wins":
        return <FastWinsScreen onNext={advance} />;
      case "app-tour":
        return <AppTourScreen onNext={advance} />;
      case "challenge":
        return (
          <ChallengeSuggestionScreen
            focusAreas={focusAreas}
            selected={selectedChallengeId}
            onSelect={(challengeId) => {
              setSelectedChallengeId(challengeId);
              trackOnboardingEvent("challenge_selected", { challenge: challengeId || null });
              void Haptics.selectionAsync();
            }}
            onNext={advance}
          />
        );
      case "notification":
        return <NotificationStep onNext={advance} />;
      case "screentime":
        return <ScreenTimeStep onNext={advance} />;
      case "referral":
        return (
          <ReferralSourceStep
            selected={referralSource}
            onSelect={selectReferralSource}
            onNext={advance}
          />
        );
      case "paywall":
        return <PaywallStep onComplete={completeOnboarding} />;
    }
  };

  return (
    <View style={s.container}>
      <GradientBackground variant="onboarding" />

      <SafeAreaView style={s.safeArea}>
        <View style={s.progressRow}>
          {showBack ? (
            <TouchableOpacity onPress={goBack} hitSlop={12} style={s.backBtn}>
              <Ionicons name="chevron-back" size={22} color={palette.white70} />
            </TouchableOpacity>
          ) : (
            <View style={s.backBtn} />
          )}
          <View style={s.progressTrack}>
            <ProgressBar step={currentStep + 1} total={TOTAL} compact />
          </View>
        </View>

        <Animated.View style={[s.flex, { opacity: fadeAnim }]}>
          {renderStep()}
        </Animated.View>
      </SafeAreaView>
    </View>
  );
}

function makeStyles() {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: "#050505",
    },
    safeArea: {
      flex: 1,
      zIndex: 10,
    },
    flex: {
      flex: 1,
    },
    progressRow: {
      paddingHorizontal: 22,
      paddingTop: 8,
      paddingBottom: 6,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    backBtn: {
      width: 24,
      height: 24,
      alignItems: "flex-start",
      justifyContent: "center",
    },
    progressTrack: {
      flex: 1,
    },
  });
}
