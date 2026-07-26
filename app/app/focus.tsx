import GradientBackground from "@/components/GradientBackground";
import Aurora from "@/components/Aurora";
import { palette } from "@/constants/theme";
import { usePreventScreenSleep } from "@/hooks/usePreventScreenSleep";
import { useTheme } from "@/hooks/useTheme";
import { dailyFocus, dailyFocusOps, db } from "@/lib/db";
import { getLocalDateString } from "@/lib/timezone";
import { useLiveQuery } from "drizzle-orm/expo-sqlite";
import { eq } from "drizzle-orm";
import * as Haptics from "expo-haptics";
import { router, Stack } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { AppState, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Circle } from "react-native-svg";

const RING_SIZE = 220;
const STROKE_WIDTH = 10;
const RADIUS = (RING_SIZE - STROKE_WIDTH) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const FOCUS_DURATION_SECONDS = 25 * 60;

function formatCountdown(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export default function FocusScreen() {
  const todayKey = getLocalDateString(new Date());
  const C = useTheme();
  const [remainingSeconds, setRemainingSeconds] = useState(FOCUS_DURATION_SECONDS);
  const [isRunning, setIsRunning] = useState(true);
  const unsavedElapsedSecondsRef = useRef(0);
  const didCompleteSessionRef = useRef(false);
  const { data: focusRows } = useLiveQuery(
    db.select().from(dailyFocus).where(eq(dailyFocus.date, todayKey)).limit(1)
  );
  usePreventScreenSleep(isRunning && remainingSeconds > 0, "kadoze-focus-room");

  const hasGoal = useMemo(() => Boolean(focusRows?.[0]?.goal?.trim()), [focusRows]);

  const goalText = useMemo(() => {
    const goal = focusRows?.[0]?.goal?.trim();
    return goal || "Set your main goal first";
  }, [focusRows]);

  useEffect(() => {
    if (!isRunning || remainingSeconds <= 0) return;

    const interval = setInterval(() => {
      setRemainingSeconds((current) => {
        if (current <= 1) {
          clearInterval(interval);
          unsavedElapsedSecondsRef.current += current;
          return 0;
        }
        unsavedElapsedSecondsRef.current += 1;
        return current - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isRunning, remainingSeconds]);

  const persistElapsedFocusTime = async (roundUpPartialMinute = false) => {
    const elapsedSeconds = unsavedElapsedSecondsRef.current;
    const minutesToPersist = roundUpPartialMinute
      ? Math.ceil(elapsedSeconds / 60)
      : Math.floor(elapsedSeconds / 60);

    if (minutesToPersist <= 0) return;

    unsavedElapsedSecondsRef.current = roundUpPartialMinute
      ? 0
      : elapsedSeconds - minutesToPersist * 60;
    await dailyFocusOps.addFocusMinutes(minutesToPersist);
  };

  useEffect(() => {
    if (remainingSeconds <= 0 && !didCompleteSessionRef.current) {
      didCompleteSessionRef.current = true;
      void persistElapsedFocusTime(true);
    }
  }, [remainingSeconds]);

  useEffect(() => {
    if (!isRunning) {
      void persistElapsedFocusTime(true);
    }
  }, [isRunning]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState !== "active") {
        void persistElapsedFocusTime(true);
      }
    });

    return () => {
      subscription.remove();
      void persistElapsedFocusTime(true);
    };
  }, []);

  const progress = remainingSeconds / FOCUS_DURATION_SECONDS;
  const countdownText = formatCountdown(remainingSeconds);
  const progressOffset = -CIRCUMFERENCE * (1 - progress);

  const toggleTimer = () => {
    if (remainingSeconds === 0) {
      didCompleteSessionRef.current = false;
      setRemainingSeconds(FOCUS_DURATION_SECONDS);
      setIsRunning(true);
      return;
    }
    if (isRunning) {
      void persistElapsedFocusTime();
    }
    setIsRunning((current) => !current);
  };

  const finishFocusSession = async () => {
    if (!hasGoal) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await persistElapsedFocusTime(true);
    await dailyFocusOps.markComplete();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    router.back();
  };

  const s = makeStyles(C);

  return (
    <View style={s.container}>
      <Stack.Screen
        options={{
          headerShown: true,
          headerTransparent: true,
          title: "Focus Room",
          headerTintColor: C.textPrimary,
          headerTitleStyle: { color: C.textPrimary },
          headerShadowVisible: false,
          headerBackButtonDisplayMode: "minimal",
          headerLeft: () => (
            <Pressable
              onPress={() => {
                void persistElapsedFocusTime(true);
                router.back();
              }}
              hitSlop={10}
            >
              <Ionicons name="chevron-back" size={24} color={C.iconSecondary} />
            </Pressable>
          ),
          headerRight: () => (
            <Pressable
              onPress={finishFocusSession}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Finish focus session"
            >
              <Ionicons
                name="checkmark"
                size={22}
                color={hasGoal ? palette.orange : C.iconSecondary}
              />
            </Pressable>
          ),
        }}
      />
      <GradientBackground />
      <View style={s.aurora} pointerEvents="none">
        <Aurora height={420} intensity={0.8} />
      </View>
      <SafeAreaView style={s.safeArea}>
        <View style={s.content}>
          <Text style={s.goal}>{goalText}</Text>
          <Text style={s.subtitle}>Stay focused. Do one thing.</Text>

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
              <Text style={s.timer}>{countdownText}</Text>
            </View>
          </View>

          <Pressable style={s.timerButton} onPress={toggleTimer}>
            <Ionicons
              name={remainingSeconds === 0 ? "refresh" : isRunning ? "pause" : "play"}
              size={24}
              color={palette.white}
            />
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}

function makeStyles(C: ReturnType<typeof import("@/hooks/useTheme").useTheme>) {
  return StyleSheet.create({
    container: { flex: 1 },
    aurora: { position: "absolute", top: 0, left: 0, right: 0, opacity: 0.72 },
    safeArea: {
      flex: 1,
      paddingHorizontal: 24,
    },
    content: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingBottom: 24,
    },
    goal: {
      color: C.textPrimary,
      fontSize: 24,
      fontWeight: "700",
      lineHeight: 32,
      textAlign: "center",
      maxWidth: 320,
    },
    subtitle: {
      color: C.textTertiary,
      fontSize: 15,
      fontWeight: "600",
      marginTop: 14,
      textAlign: "center",
    },
    ringWrap: {
      width: RING_SIZE,
      height: RING_SIZE,
      marginTop: 42,
      alignItems: "center",
      justifyContent: "center",
    },
    ringSvg: { position: "absolute" },
    ringCenter: {
      width: 170,
      height: 170,
      borderRadius: 999,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: C.inputBg,
    },
    timer: {
      color: C.textPrimary,
      fontSize: 56,
      fontWeight: "300",
      letterSpacing: -2,
    },
    timerButton: {
      width: 64,
      height: 64,
      borderRadius: 999,
      marginTop: 32,
      backgroundColor: palette.orange,
      alignItems: "center",
      justifyContent: "center",
    },
  });
}
