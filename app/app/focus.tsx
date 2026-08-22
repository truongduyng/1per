import GradientBackground from "@/components/GradientBackground";
import Aurora, { AURORA_LIGHT_AURORA_COLORS, AURORA_LIGHT_SKY_COLORS } from "@/components/Aurora";
import { palette } from "@/constants/theme";
import { usePreventScreenSleep } from "@/hooks/usePreventScreenSleep";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useTheme } from "@/hooks/useTheme";
import { dailyFocus, dailyFocusOps, db } from "@/lib/db";
import { getLocalDateString } from "@/lib/timezone";
import { useLiveQuery } from "drizzle-orm/expo-sqlite";
import { eq } from "drizzle-orm";
import { Asset } from "expo-asset";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as Haptics from "expo-haptics";
import * as Sharing from "expo-sharing";
import { router, Stack } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { AppState, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Circle } from "react-native-svg";
import { OnePerVideoComposer } from "@/modules/one-per-video-composer";

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
  const colorScheme = useColorScheme();
  const isLight = colorScheme === "light";
  const [remainingSeconds, setRemainingSeconds] = useState(FOCUS_DURATION_SECONDS);
  const [isRunning, setIsRunning] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [videoSpeed, setVideoSpeed] = useState(1);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const recordingPromiseRef = useRef<Promise<{ uri: string } | undefined> | undefined>(undefined);
  const recordedSegmentsRef = useRef<string[]>([]);
  const unsavedElapsedSecondsRef = useRef(0);
  const didCompleteSessionRef = useRef(false);
  const { data: focusRows } = useLiveQuery(
    db.select().from(dailyFocus).where(eq(dailyFocus.date, todayKey)).limit(1)
  );
  usePreventScreenSleep(isRunning && remainingSeconds > 0, "kadoze-focus-room");

  const stopCameraRecording = async () => {
    if (!isRecording) return;
    cameraRef.current?.stopRecording();
    const recording = await recordingPromiseRef.current?.catch(() => undefined);
    recordingPromiseRef.current = undefined;
    setIsRecording(false);
    if (recording?.uri) recordedSegmentsRef.current.push(recording.uri);
    return recording?.uri;
  };

  const startCameraRecording = async () => {
    if (!cameraPermission?.granted) {
      const permission = await requestCameraPermission();
      if (!permission.granted) return false;
    }
    if (!cameraRef.current || isRecording) return true;

    setIsRecording(true);
    const recording = cameraRef.current.recordAsync({ maxDuration: 60 * 60 });
    recordingPromiseRef.current = recording;
    void recording.then(() => {
      recordingPromiseRef.current = undefined;
      setIsRecording(false);
    }).catch(() => {
      recordingPromiseRef.current = undefined;
      setIsRecording(false);
    });
    return true;
  };

  const hasGoal = useMemo(() => Boolean(focusRows?.[0]?.goal?.trim()), [focusRows]);

  const goalText = useMemo(() => {
    const goal = focusRows?.[0]?.goal?.trim();
    return goal || "Set your main goal first";
  }, [focusRows]);

  useEffect(() => {
    if (isRunning && cameraPermission?.granted && !isRecording) {
      void startCameraRecording();
    }
  }, [cameraPermission?.granted, isRecording, isRunning]);

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
      void stopCameraRecording();
      setIsRunning(false);
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
        void stopCameraRecording();
        setIsRunning(false);
      }
    });

    return () => {
      subscription.remove();
      void persistElapsedFocusTime(true);
    };
  }, []);

  useEffect(() => {
    return () => {
      cameraRef.current?.stopRecording();
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
      void startCameraRecording();
      return;
    }
    if (isRunning) {
      void persistElapsedFocusTime();
      void stopCameraRecording();
    } else {
      void startCameraRecording();
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
    await stopCameraRecording();
    if (recordedSegmentsRef.current.length > 0) {
      const logo = Asset.fromModule(require("@/assets/images/new_logo_transparent.png"));
      await logo.downloadAsync();
      try {
        const composedVideoPath = await OnePerVideoComposer.composeAsync({
          videoUris: recordedSegmentsRef.current,
          speed: videoSpeed,
          goal: goalText,
          logoUri: logo.localUri ?? logo.uri,
          durationSeconds: FOCUS_DURATION_SECONDS,
        });
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(
            composedVideoPath.startsWith("file://") ? composedVideoPath : `file://${composedVideoPath}`,
            { mimeType: "video/mp4", dialogTitle: "Share your 1Per focus video" }
          );
        }
      } catch {
        // The raw segment remains available if export fails.
      }
    }
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
                void (async () => {
                  await persistElapsedFocusTime(true);
                  await stopCameraRecording();
                  router.back();
                })();
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
      {cameraPermission?.granted ? (
        <CameraView
          ref={cameraRef}
          style={s.camera}
          facing="front"
          mode="video"
          mirror
        />
      ) : null}
      <View style={s.cameraShade} pointerEvents="none" />
      <GradientBackground />
      <View style={[s.aurora, isLight && s.auroraLight]} pointerEvents="none">
        <Aurora
          height={420}
          intensity={isLight ? 0.5 : 0.8}
          auroraColors={isLight ? [...AURORA_LIGHT_AURORA_COLORS] : undefined}
          skyColors={isLight ? [...AURORA_LIGHT_SKY_COLORS] : undefined}
        />
      </View>
      <SafeAreaView style={s.safeArea}>
        <View style={s.content}>
          <Text style={s.goal}>{goalText}</Text>
          <Text style={s.subtitle}>Stay focused. Do one thing.</Text>

          {isRecording ? <Text style={s.recordingLabel}>● Recording</Text> : null}

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
          <Text style={s.timerHint}>
            {isRunning ? "Pause timer and recording" : "Start timer and recording"}
          </Text>
          <View style={s.speedRow}>
            {[1, 2, 4].map((speed) => (
              <Pressable
                key={speed}
                onPress={() => setVideoSpeed(speed)}
                style={[s.speedButton, videoSpeed === speed && s.speedButtonActive]}
              >
                <Text style={[s.speedText, videoSpeed === speed && s.speedTextActive]}>{speed}×</Text>
              </Pressable>
            ))}
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}

function makeStyles(C: ReturnType<typeof import("@/hooks/useTheme").useTheme>) {
  return StyleSheet.create({
    container: { flex: 1 },
    camera: { ...StyleSheet.absoluteFill, opacity: 0.58 },
    cameraShade: {
      ...StyleSheet.absoluteFill,
      backgroundColor: "rgba(0,0,0,0.22)",
    },
    aurora: { position: "absolute", top: 0, left: 0, right: 0, opacity: 0.72 },
    auroraLight: { opacity: 0.55 },
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
    recordingLabel: {
      color: "#FF453A",
      fontSize: 13,
      fontWeight: "700",
      marginTop: 12,
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
    timerHint: {
      color: C.textTertiary,
      fontSize: 12,
      fontWeight: "600",
      marginTop: 10,
    },
    speedRow: { flexDirection: "row", gap: 8, marginTop: 18 },
    speedButton: {
      minWidth: 44,
      paddingVertical: 7,
      paddingHorizontal: 10,
      borderRadius: 999,
      alignItems: "center",
      backgroundColor: "rgba(0,0,0,0.28)",
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.18)",
    },
    speedButtonActive: { backgroundColor: palette.orange, borderColor: palette.orange },
    speedText: { color: C.textSecondary, fontSize: 12, fontWeight: "700" },
    speedTextActive: { color: palette.white },
  });
}
