import GradientBackground from "@/components/GradientBackground";
import Aurora, { AURORA_LIGHT_AURORA_COLORS, AURORA_LIGHT_SKY_COLORS } from "@/components/Aurora";
import { palette } from "@/constants/theme";
import { usePreventScreenSleep } from "@/hooks/usePreventScreenSleep";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useTheme } from "@/hooks/useTheme";
import { buildEveningReflection } from "@/lib/eveningReflection";
import { dailyFocus, dailyFocusOps, db, habitCompletions, habits } from "@/lib/db";
import { getLocalDateString } from "@/lib/timezone";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { desc, eq } from "drizzle-orm";
import { router, Stack } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLiveQuery } from "drizzle-orm/expo-sqlite";
import Svg, { Circle } from "react-native-svg";

const RESET_DURATION_SECONDS = 10 * 60;
const RING_SIZE = 248;
const STROKE_WIDTH = 11;
const RADIUS = (RING_SIZE - STROKE_WIDTH) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const HEADER_HEIGHT = Platform.OS === "ios" ? 44 : 56;
const RESET_STEPS = [
  {
    title: "Clean your space",
    hint: "Put obvious things back, clear one surface, and remove visual noise.",
  },
  {
    title: "Clean your mind",
    hint: "Drop unfinished thoughts, worries, or reminders before you go to sleep.",
  },
  {
    title: "Plan for tomorrow",
    hint: "Set one main goal so tomorrow starts with direction.",
  },
] as const;

function formatCountdown(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function getTomorrowKey() {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return getLocalDateString(tomorrow);
}

export default function EveningResetScreen() {
  const todayKey = useMemo(() => getLocalDateString(new Date()), []);
  const tomorrowKey = useMemo(() => getTomorrowKey(), []);
  const C = useTheme();
  const colorScheme = useColorScheme();
  const isLight = colorScheme === "light";
  const [remainingSeconds, setRemainingSeconds] = useState(RESET_DURATION_SECONDS);
  const [isRunning, setIsRunning] = useState(true);
  const [completedSteps, setCompletedSteps] = useState<Record<number, boolean>>({});
  const [goalDraft, setGoalDraft] = useState("");
  const [isSavingPlan, setIsSavingPlan] = useState(false);
  const [todayGoalHint, setTodayGoalHint] = useState("");
  const { data: focusRows } = useLiveQuery(
    db.select().from(dailyFocus).orderBy(desc(dailyFocus.date)).limit(14)
  );
  const { data: habitRows } = useLiveQuery(db.select().from(habits));
  const { data: completionRows } = useLiveQuery(db.select().from(habitCompletions));
  usePreventScreenSleep(isRunning && remainingSeconds > 0, "kadoze-evening-reset");

  useEffect(() => {
    if (!isRunning || remainingSeconds <= 0) return;

    const interval = setInterval(() => {
      setRemainingSeconds((current) => {
        if (current <= 1) {
          clearInterval(interval);
          return 0;
        }
        return current - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isRunning, remainingSeconds]);

  useEffect(() => {
    let isActive = true;

    const loadTomorrowPlan = async () => {
      const [[focusRow], [todayFocusRow]] = await Promise.all([
        db.select().from(dailyFocus).where(eq(dailyFocus.date, tomorrowKey)).limit(1),
        db.select().from(dailyFocus).where(eq(dailyFocus.date, todayKey)).limit(1),
      ]);

      if (!isActive) return;

      setGoalDraft(focusRow?.goal ?? "");
      setTodayGoalHint(todayFocusRow?.goal ?? "");
    };

    void loadTomorrowPlan();

    return () => {
      isActive = false;
    };
  }, [todayKey, tomorrowKey]);

  const progress = remainingSeconds / RESET_DURATION_SECONDS;
  const progressOffset = -CIRCUMFERENCE * (1 - progress);
  const countdownText = formatCountdown(remainingSeconds);
  const activeStepIndex = useMemo(
    () => RESET_STEPS.findIndex((_, index) => !completedSteps[index]),
    [completedSteps]
  );
  const isCompleted = activeStepIndex === -1;
  const currentStepIndex = activeStepIndex === -1 ? RESET_STEPS.length - 1 : activeStepIndex;
  const currentStep = RESET_STEPS[currentStepIndex];
  const eveningReflection = useMemo(
    () =>
      buildEveningReflection({
        todayKey,
        focusRows: focusRows ?? [],
        habits: habitRows ?? [],
        completions: completionRows ?? [],
      }),
    [completionRows, focusRows, habitRows, todayKey]
  );

  const saveTomorrowPlan = async () => {
    const normalizedGoal = goalDraft.trim();

    if (!normalizedGoal) return false;

    setIsSavingPlan(true);
    try {
      await db
        .insert(dailyFocus)
        .values({ date: tomorrowKey, goal: normalizedGoal, updatedAt: new Date() })
        .onConflictDoUpdate({
          target: [dailyFocus.date],
          set: { goal: normalizedGoal, updatedAt: new Date() },
        });

      return true;
    } finally {
      setIsSavingPlan(false);
    }
  };

  const handleStepPress = async (index: number) => {
    if (index > currentStepIndex) return;

    if (completedSteps[index]) {
      if (index === RESET_STEPS.length - 1) {
        void dailyFocusOps.markEveningResetIncomplete();
      }
      setCompletedSteps((current) => {
        const next = { ...current };
        delete next[index];
        for (let i = index + 1; i < RESET_STEPS.length; i += 1) {
          delete next[i];
        }
        return next;
      });
      return;
    }

    if (index === 2) {
      const saved = await saveTomorrowPlan();
      if (!saved) return;
    }

    setCompletedSteps((current) => {
      const next = { ...current, [index]: true };
      if (index === RESET_STEPS.length - 1) {
        setIsRunning(false);
        void dailyFocusOps.markEveningResetComplete();
      }
      return next;
    });
  };

  const s = makeStyles(C);

  return (
    <View style={s.container}>
      <GradientBackground />
      <View style={[s.aurora, isLight && s.auroraLight]} pointerEvents="none">
        <Aurora
          height={390}
          intensity={isLight ? 0.45 : 0.7}
          auroraColors={isLight ? [...AURORA_LIGHT_AURORA_COLORS] : undefined}
          skyColors={isLight ? [...AURORA_LIGHT_SKY_COLORS] : undefined}
        />
      </View>
      <Stack.Screen
        options={{
          headerShown: true,
          headerTransparent: true,
          title: "Evening Reset",
          headerTintColor: C.textPrimary,
          headerTitleStyle: { color: C.textPrimary },
          headerShadowVisible: false,
          headerBackButtonDisplayMode: "minimal",
        }}
      />
      <SafeAreaView style={s.safeArea}>
        <KeyboardAwareScrollView
          bottomOffset={32}
          contentContainerStyle={s.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={s.timerContent}>
                <View style={s.ringWrap}>
                  <Svg width={RING_SIZE} height={RING_SIZE} style={s.ringSvg}>
                    <Circle
                      cx={RING_SIZE / 2}
                      cy={RING_SIZE / 2}
                      r={RADIUS}
                      stroke={C.cardBorder}
                      strokeWidth={STROKE_WIDTH}
                      fill="none"
                    />
                    <Circle
                      cx={RING_SIZE / 2}
                      cy={RING_SIZE / 2}
                      r={RADIUS}
                      stroke={palette.orange}
                      strokeWidth={STROKE_WIDTH}
                      fill="none"
                      strokeLinecap="round"
                      strokeDasharray={`${CIRCUMFERENCE} ${CIRCUMFERENCE}`}
                      strokeDashoffset={progressOffset}
                      transform={`rotate(-90 ${RING_SIZE / 2} ${RING_SIZE / 2})`}
                    />
                  </Svg>

                  <View style={s.ringCenter}>
                    <Text style={s.timerText}>{countdownText}</Text>
                    <Text style={s.timerMode}>Reset</Text>
                  </View>
                </View>

                {!isCompleted ? (
                  <Pressable
                    style={s.pauseControl}
                    onPress={() => setIsRunning((current) => !current)}
                  >
                    <Ionicons
                      name={isRunning ? "pause" : "play"}
                      size={22}
                      color={palette.white}
                    />
                  </Pressable>
                ) : null}

                <View style={s.aiCard}>


                  <Text style={s.aiMessage}>
                    {eveningReflection.summary} {eveningReflection.pattern}
                  </Text>
                </View>

                <View style={s.stepsCard}>
                  <Text style={s.stepsLabel}>RESET STEPS</Text>

                  <View style={s.stepsList}>
                    {RESET_STEPS.map((item, index) => {
                      const isDone = Boolean(completedSteps[index]);
                      const isCurrent = index === currentStepIndex;
                      const isLocked = index > currentStepIndex;

                      return (
                        <View key={item.title} style={s.stepBlock}>
                          <Pressable
                            style={[
                              s.stepRow,
                              isCurrent && s.stepRowCurrent,
                              isLocked && s.stepRowLocked,
                            ]}
                            disabled={isSavingPlan}
                            onPress={() => handleStepPress(index)}
                          >
                            <View style={s.stepCopy}>
                              <Text style={s.stepKicker}>{index + 1}</Text>
                              <View style={s.stepTextWrap}>
                                <Text style={[s.stepText, isDone && s.stepTextActive]}>
                                  {item.title}
                                </Text>
                                {isCurrent && !isCompleted ? (
                                  <Text style={s.stepHint}>{currentStep.hint}</Text>
                                ) : null}
                              </View>
                            </View>
                            <View style={[s.stepIcon, isDone && s.stepIconActive]}>
                              {isDone ? (
                                <Ionicons name="checkmark" size={14} color={palette.white} />
                              ) : null}
                            </View>
                          </Pressable>

                          {index === 2 && isCurrent && !isCompleted ? (
                            <View style={s.planCard}>
                              <Text style={s.planSectionLabel}>MAIN GOAL</Text>
                              <TextInput
                                style={s.planInput}
                                value={goalDraft}
                                onChangeText={setGoalDraft}
                                placeholder="Tomorrow's main goal"
                                placeholderTextColor={C.textPlaceholder}
                                returnKeyType="next"
                              />
                              {todayGoalHint && !goalDraft ? (
                                <Pressable style={s.hintButton} onPress={() => setGoalDraft(todayGoalHint)}>
                                  <Ionicons name="arrow-forward-circle-outline" size={14} color={C.textTertiary} />
                                  <Text style={s.hintButtonText} numberOfLines={1}>{todayGoalHint}</Text>
                                </Pressable>
                              ) : null}
                              {isSavingPlan ? <Text style={s.planSaving}>Saving...</Text> : null}
                            </View>
                          ) : null}
                        </View>
                      );
                    })}
                  </View>

                  {isCompleted ? (
                    <View style={s.doneInlineCard}>
                      <Text style={s.doneInlineTitle}>Great job.</Text>
                      <Text style={s.doneInlineBody}>
                        You&apos;ve reset your space and mind, and lined up tomorrow&apos;s first move.
                      </Text>
                      <Pressable
                        style={s.doneInlineButton}
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          router.replace("/" as any);
                        }}
                      >
                        <Text style={s.doneInlineButtonText}>Done</Text>
                      </Pressable>
                    </View>
                  ) : null}
                </View>
          </View>
        </KeyboardAwareScrollView>
      </SafeAreaView>
    </View>
  );
}

function makeStyles(C: ReturnType<typeof import("@/hooks/useTheme").useTheme>) {
  return StyleSheet.create({
    container: { flex: 1 },
    aurora: { position: "absolute", top: 0, left: 0, right: 0, opacity: 0.68 },
    auroraLight: { opacity: 0.5 },
    safeArea: { flex: 1, paddingHorizontal: 24 },
    scrollContent: { paddingBottom: 28 },
    timerContent: {
      alignItems: "center",
      paddingTop: HEADER_HEIGHT + 20,
      paddingBottom: 12,
    },
    ringWrap: {
      width: RING_SIZE,
      height: RING_SIZE,
      alignItems: "center",
      justifyContent: "center",
    },
    ringSvg: { position: "absolute" },
    ringCenter: {
      width: 184,
      height: 184,
      borderRadius: 999,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: C.inputBg,
    },
    timerText: {
      color: C.textPrimary,
      fontSize: 58,
      fontWeight: "300",
      letterSpacing: -2,
    },
    timerMode: {
      marginTop: 4,
      color: C.textSecondary,
      fontSize: 24,
      fontWeight: "500",
    },
    pauseControl: {
      width: 66,
      height: 66,
      borderRadius: 33,
      backgroundColor: palette.orange,
      alignItems: "center",
      justifyContent: "center",
      marginTop: 14,
    },
    aiCard: {
      width: "100%",
      borderRadius: 18,
      backgroundColor: C.cardBg,
      borderWidth: 1,
      borderColor: C.accentBorderSubtle,
      paddingHorizontal: 18,
      paddingVertical: 18,
      marginTop: 24,
      gap: 16,
    },
    aiHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    aiIconWrap: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: C.accentBgSubtle,
      alignItems: "center",
      justifyContent: "center",
    },
    aiTitle: {
      color: C.textPrimary,
      fontSize: 18,
      fontWeight: "700",
    },
    aiMessage: {
      color: C.textSecondary,
      fontSize: 15,
      lineHeight: 22,
      fontWeight: "500",
    },
    stepsCard: {
      width: "100%",
      borderRadius: 18,
      backgroundColor: C.cardBg,
      borderWidth: 1,
      borderColor: C.cardBorder,
      paddingHorizontal: 18,
      paddingVertical: 18,
      marginTop: 28,
    },
    stepsLabel: {
      color: C.textTertiary,
      fontSize: 11,
      fontWeight: "700",
      letterSpacing: 1.4,
      marginBottom: 16,
    },
    stepsList: { gap: 10 },
    stepBlock: { gap: 8 },
    stepRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
      borderRadius: 14,
      paddingHorizontal: 12,
      paddingVertical: 12,
    },
    stepRowCurrent: { backgroundColor: C.inputBg },
    stepRowLocked: { opacity: 0.5 },
    stepCopy: {
      flex: 1,
      flexDirection: "row",
      gap: 10,
    },
    stepKicker: {
      color: C.textTertiary,
      fontSize: 13,
      fontWeight: "700",
      minWidth: 10,
      marginTop: 1,
    },
    stepTextWrap: { flex: 1, gap: 4 },
    stepText: {
      color: C.textSecondary,
      fontSize: 16,
      fontWeight: "600",
    },
    stepTextActive: { color: C.textPrimary },
    stepHint: {
      color: C.textQuaternary,
      fontSize: 13,
      lineHeight: 19,
    },
    stepIcon: {
      width: 28,
      height: 28,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: C.cardBorder,
      backgroundColor: C.inputBg,
      alignItems: "center",
      justifyContent: "center",
    },
    stepIconActive: {
      borderColor: palette.orangeStrong,
      backgroundColor: palette.orangeStrong,
    },
    planCard: {
      gap: 10,
      marginLeft: 32,
      paddingBottom: 2,
    },
    planSectionLabel: {
      color: C.textTertiary,
      fontSize: 11,
      fontWeight: "700",
      letterSpacing: 1.2,
      marginTop: 4,
    },
    planInput: {
      borderRadius: 12,
      borderWidth: 1,
      borderColor: C.inputBorder,
      backgroundColor: C.inputBg,
      color: C.textPrimary,
      paddingHorizontal: 14,
      paddingVertical: 13,
      fontSize: 15,
      textAlignVertical: "center",
    },
    hintButton: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      alignSelf: "flex-start",
      backgroundColor: C.inputBg,
      borderWidth: 1,
      borderColor: C.cardBorder,
      borderRadius: 8,
      paddingHorizontal: 10,
      paddingVertical: 6,
      maxWidth: "100%",
    },
    hintButtonText: {
      color: C.textSecondary,
      fontSize: 13,
      fontWeight: "500",
      flexShrink: 1,
    },
    planSaving: {
      color: palette.orange,
      fontSize: 12,
      fontWeight: "600",
    },
    doneInlineCard: {
      marginTop: 16,
      paddingTop: 16,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: C.divider,
      alignItems: "center",
    },
    doneInlineTitle: {
      color: C.textPrimary,
      fontSize: 22,
      fontWeight: "700",
      textAlign: "center",
    },
    doneInlineBody: {
      marginTop: 8,
      color: C.textTertiary,
      fontSize: 14,
      lineHeight: 21,
      textAlign: "center",
      maxWidth: 280,
    },
    doneInlineButton: {
      marginTop: 16,
      backgroundColor: palette.orange,
      borderRadius: 14,
      paddingVertical: 14,
      paddingHorizontal: 28,
      alignItems: "center",
    },
    doneInlineButtonText: {
      color: palette.white,
      fontSize: 16,
      fontWeight: "700",
    },
  });
}
