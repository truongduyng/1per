import GradientBackground from "@/components/GradientBackground";
import Aurora, {
  AURORA_LIGHT_AURORA_COLORS,
  AURORA_LIGHT_SKY_COLORS,
} from "@/components/Aurora";
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

function getTimelapseSpeed(seconds: number) {
  if (seconds <= 60) return 2;
  if (seconds <= 5 * 60) return 4;
  if (seconds <= 15 * 60) return 8;
  if (seconds <= 25 * 60) return 16;
  return 32;
}

export default function FocusScreen() {
  const todayKey = getLocalDateString(new Date());
  const C = useTheme();
  const colorScheme = useColorScheme();
  const isLight = colorScheme === "light";
  const [remainingSeconds, setRemainingSeconds] = useState(
    FOCUS_DURATION_SECONDS,
  );
  const [isRunning, setIsRunning] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isCameraEnabled, setIsCameraEnabled] = useState(false);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const recordingPromiseRef = useRef<
    Promise<{ uri: string } | undefined> | undefined
  >(undefined);
  const wantsRecordingRef = useRef(false);
  const cameraReadyRef = useRef(false);
  const recordedSegmentsRef = useRef<string[]>([]);
  const unsavedElapsedSecondsRef = useRef(0);
  const totalElapsedSecondsRef = useRef(0);
  const didCompleteSessionRef = useRef(false);
  const { data: focusRows } = useLiveQuery(
    db.select().from(dailyFocus).where(eq(dailyFocus.date, todayKey)).limit(1),
  );
  usePreventScreenSleep(isRunning && remainingSeconds > 0, "kadoze-focus-room");

  const stopCameraRecording = async () => {
    wantsRecordingRef.current = false;
    const recordingPromise = recordingPromiseRef.current;
    if (!recordingPromise) {
      setIsRecording(false);
      return;
    }
    cameraRef.current?.stopRecording();
    return recordingPromise.catch(() => undefined);
  };

  const startCameraRecording = async () => {
    wantsRecordingRef.current = true;
    if (!cameraPermission?.granted) {
      const permission = await requestCameraPermission();
      if (!permission.granted) return false;
    }
    if (!cameraRef.current || !cameraReadyRef.current || recordingPromiseRef.current)
      return true;

    try {
      const recording = cameraRef.current.recordAsync({ maxDuration: 60 * 60 });
      recordingPromiseRef.current = recording;
      setIsRecording(true);
      void recording
        .then((result) => {
          if (result?.uri) recordedSegmentsRef.current.push(result.uri);
        })
        .catch(() => undefined)
        .finally(() => {
          if (recordingPromiseRef.current === recording) {
            recordingPromiseRef.current = undefined;
            setIsRecording(false);
          }
        });
    } catch {
      recordingPromiseRef.current = undefined;
      setIsRecording(false);
      return false;
    }
    return true;
  };

  const hasGoal = useMemo(
    () => Boolean(focusRows?.[0]?.goal?.trim()),
    [focusRows],
  );

  const goalText = useMemo(() => {
    const goal = focusRows?.[0]?.goal?.trim();
    return goal || "Set your main goal first";
  }, [focusRows]);

  useEffect(() => {
    if (!isRunning) return;

    const interval = setInterval(() => {
      setRemainingSeconds((current) => {
        if (current <= 1) {
          clearInterval(interval);
          unsavedElapsedSecondsRef.current += current;
          totalElapsedSecondsRef.current += current;
          return 0;
        }
        unsavedElapsedSecondsRef.current += 1;
        totalElapsedSecondsRef.current += 1;
        return current - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isRunning]);

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
    const camera = cameraRef.current;
    return () => {
      camera?.stopRecording();
    };
  }, []);

  const progress = remainingSeconds / FOCUS_DURATION_SECONDS;
  const countdownText = formatCountdown(remainingSeconds);
  const progressOffset = -CIRCUMFERENCE * (1 - progress);

  const toggleTimer = () => {
    if (remainingSeconds === 0) {
      didCompleteSessionRef.current = false;
      setRemainingSeconds(FOCUS_DURATION_SECONDS);
      totalElapsedSecondsRef.current = 0;
      setIsRunning(true);
      if (isCameraEnabled) void startCameraRecording();
      return;
    }
    if (isRunning) {
      void persistElapsedFocusTime();
      void stopCameraRecording();
    } else if (isCameraEnabled) {
      void startCameraRecording();
    }
    setIsRunning((current) => !current);
  };

  const toggleCamera = async () => {
    if (isCameraEnabled) {
      await stopCameraRecording();
      cameraReadyRef.current = false;
      setIsCameraEnabled(false);
      return;
    }

    if (!cameraPermission?.granted) {
      const permission = await requestCameraPermission();
      if (!permission.granted) return;
    }
    setIsCameraEnabled(true);
  };

  const finishFocusSession = async () => {
    if (!hasGoal) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await persistElapsedFocusTime(true);
    await stopCameraRecording();
    let composedVideoUri: string | undefined;
    if (recordedSegmentsRef.current.length > 0 && OnePerVideoComposer) {
      const recordedDurationSeconds = Math.max(1, totalElapsedSecondsRef.current);
      const logo = Asset.fromModule(
        require("@/assets/images/new_logo_transparent.png"),
      );
      await logo.downloadAsync();
      try {
        const composedVideoPath = await OnePerVideoComposer.composeAsync({
          videoUris: recordedSegmentsRef.current,
          speed: getTimelapseSpeed(recordedDurationSeconds),
          goal: goalText,
          logoUri: logo.localUri ?? logo.uri,
          durationSeconds: recordedDurationSeconds,
        });
        composedVideoUri = composedVideoPath.startsWith("file://")
          ? composedVideoPath
          : `file://${composedVideoPath}`;
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(composedVideoUri, {
            mimeType: "video/mp4",
            dialogTitle: "Share your 1Per focus video",
          });
        }
      } catch {
        // The raw segment remains available if export fails.
      }
    }
    await dailyFocusOps.markComplete(composedVideoUri);
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
              style={[s.cameraToggle, isRecording && s.cameraToggleRecording]}
              onPress={() => void toggleCamera()}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={isCameraEnabled ? "Turn camera off" : "Turn camera on"}
            >
              <Ionicons
                name={isCameraEnabled ? "videocam" : "videocam-off"}
                size={22}
                color={isRecording ? palette.white : isCameraEnabled ? palette.orange : C.iconSecondary}
              />
            </Pressable>
          ),
        }}
      />
      <GradientBackground />
      {cameraPermission?.granted && isCameraEnabled ? (
        <CameraView
          ref={cameraRef}
          style={s.camera}
          facing="front"
          mode="video"
          mirror
          onCameraReady={() => {
            cameraReadyRef.current = true;
            if (wantsRecordingRef.current && cameraPermission?.granted) {
              void startCameraRecording();
            }
          }}
          onMountError={() => {
            cameraReadyRef.current = false;
          }}
        />
      ) : null}
      <View style={s.cameraShade} pointerEvents="none" />
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

        </View>
        <View style={s.bottomControls}>
          <Pressable
            style={s.timerButton}
            onPress={toggleTimer}
            accessibilityRole="button"
            accessibilityLabel={isRunning ? "Pause timer" : "Start timer"}
          >
            <Ionicons
              name={
                remainingSeconds === 0
                  ? "refresh"
                  : isRunning
                    ? "pause"
                    : "play"
              }
              size={24}
              color={palette.white}
            />
          </Pressable>
          <Pressable
            style={[s.doneButton, !hasGoal && s.doneButtonDisabled]}
            onPress={() => void finishFocusSession()}
            accessibilityRole="button"
            accessibilityLabel="Finish focus session"
          >
            <Ionicons name="checkmark" size={25} color={palette.white} />
          </Pressable>
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
    cameraToggle: {
      width: 38,
      height: 38,
      borderRadius: 999,
      alignItems: "center",
      justifyContent: "center",
    },
    cameraToggleRecording: { backgroundColor: "#D92D45" },
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
      backgroundColor: palette.orange,
      alignItems: "center",
      justifyContent: "center",
    },
    bottomControls: {
      position: "absolute",
      left: 24,
      right: 24,
      bottom: 18,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    doneButton: {
      width: 64,
      height: 64,
      borderRadius: 999,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: palette.orange,
    },
    doneButtonDisabled: { opacity: 0.45 },
  });
}
