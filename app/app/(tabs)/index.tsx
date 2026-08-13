import GradientBackground from "@/components/GradientBackground";
import {
  db,
  habits,
  habitCompletions,
  dailyFocus,
  completionOps,
  dailyFocusOps,
} from "@/lib/db";
import {
  type DailyAffirmation,
  getDailyAffirmation,
  syncDailyAffirmationWidget,
} from "@/lib/dailyAffirmation";
import { getTodayInLocalTimezone, getLocalDateString } from "@/lib/timezone";
import { useProfile } from "@/hooks/useProfile";
import { useTheme } from "@/hooks/useTheme";
import { useLiveQuery } from "drizzle-orm/expo-sqlite";
import { desc, isNull } from "drizzle-orm";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useEffect, useMemo, useState, useRef } from "react";
import {
  Animated,
  AppState,
  Easing,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  Keyboard,
  useAnimatedValue,
} from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { DAY_NAMES } from "@/lib/performance";
import { Fonts, palette } from "@/constants/theme";
import Ionicons from "@expo/vector-icons/Ionicons";
import { resolveIoniconName } from "@/lib/iconNames";
import {
  APP_BLOCKER_SELECTION_ID,
  AppBlockerSelectionSheet,
  appBlocker,
  type AppBlockerSelectionMetadata,
  type AppBlockerSelectionSummary,
} from "@/lib/appBlocker";

const GOAL_CONFETTI = [
  { x: -34, y: -34, color: "#FF6B22", rotate: "-28deg" },
  { x: -12, y: -46, color: "#FFD166", rotate: "18deg" },
  { x: 24, y: -38, color: "#2EC4B6", rotate: "42deg" },
  { x: 42, y: -8, color: "#FF9F1C", rotate: "-18deg" },
  { x: 30, y: 28, color: "#E85D75", rotate: "24deg" },
  { x: -24, y: 32, color: "#7B61FF", rotate: "-42deg" },
];

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const C = useTheme();
  const { userProfile } = useProfile();
  const today = useMemo(() => getTodayInLocalTimezone(), []);
  const todayKey = getLocalDateString(today);
  const todayName = DAY_NAMES[today.getDay()];
  const [dailyAffirmation, setDailyAffirmation] =
    useState<DailyAffirmation | null>(null);

  const { data: allHabits } = useLiveQuery(
    db.select().from(habits).where(isNull(habits.archivedAt)),
  );
  const { data: allCompletions } = useLiveQuery(
    db.select().from(habitCompletions),
  );
  const { data: focusRows } = useLiveQuery(
    db.select().from(dailyFocus).orderBy(desc(dailyFocus.date)).limit(5),
  );
  const todayFocus = useMemo(
    () => focusRows?.find((f) => f.date === todayKey) ?? null,
    [focusRows, todayKey],
  );

  const [editingGoal, setEditingGoal] = useState(false);
  const [goalDraft, setGoalDraft] = useState("");
  const goalInputRef = useRef<TextInput>(null);

  const openGoalEditor = () => {
    setGoalDraft(todayFocus?.goal ?? "");
    setEditingGoal(true);
    setTimeout(() => goalInputRef.current?.focus(), 50);
  };

  const saveGoal = async () => {
    setEditingGoal(false);
    Keyboard.dismiss();
    await dailyFocusOps.upsertGoal(goalDraft);
  };

  const todayHabits = useMemo(() => {
    const list = allHabits ?? [];
    return list.filter((h) => (h.daysOfWeek as string[]).includes(todayName));
  }, [allHabits, todayName]);

  const doneIds = useMemo(() => {
    const set = new Set<number>();
    for (const c of allCompletions ?? []) {
      if (c.date === todayKey && c.status === "done") set.add(c.habitId);
    }
    return set;
  }, [allCompletions, todayKey]);

  const toggleHabit = async (habitId: number, isDone: boolean) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (isDone) {
      await completionOps.markUndone(habitId, today);
    } else {
      await completionOps.markDone(habitId, today);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  };

  const isEveningResetUnlocked = useMemo(
    () => __DEV__ || new Date().getHours() >= 21,
    [],
  );
  const [showResetLockMessage, setShowResetLockMessage] = useState(false);
  const [blockerStatus, setBlockerStatus] = useState("Not configured");
  const [blockerSelection, setBlockerSelection] =
    useState<AppBlockerSelectionSummary>({
      supported: appBlocker.isSupported,
    });
  const [showBlockerPicker, setShowBlockerPicker] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const loadAffirmation = async () => {
      try {
        const now = getTodayInLocalTimezone();
        const dateKey = getLocalDateString(now);
        const dayName = DAY_NAMES[now.getDay()];
        const affirmation = await getDailyAffirmation(dateKey, dayName);
        if (cancelled) return;

        setDailyAffirmation(affirmation);
        syncDailyAffirmationWidget(affirmation);
      } catch (error) {
        console.warn("Failed to load daily affirmation:", error);
      }
    };

    loadAffirmation();

    // Re-sync on foreground so the widget picks up a new day's affirmation
    // even if the app was left running/backgrounded across midnight.
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        loadAffirmation();
      }
    });

    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, []);

  const firstName = userProfile?.name?.split(" ")[0] ?? "there";
  const goalText = (todayFocus?.goal ?? "").trim();
  const isGoalComplete = Boolean(todayFocus?.completedAt);
  const habitsDoneCount = todayHabits.filter((habit) =>
    doneIds.has(habit.id),
  ).length;
  const hasHabitsDue = todayHabits.length > 0;
  const habitsComplete =
    !hasHabitsDue || habitsDoneCount === todayHabits.length;
  const appLockUnlocked = isGoalComplete && habitsComplete;
  const hasBlockedAppSelection = Boolean(blockerSelection.hasSelection);
  const lockBlockers = [
    {
      label: goalText ? "Main task" : "Set main task",
      done: isGoalComplete,
      detail: goalText || "Choose the one thing that matters first",
    },
    {
      label: hasHabitsDue ? "Habits" : "No habits due",
      done: habitsComplete,
      detail: hasHabitsDue
        ? `${habitsDoneCount}/${todayHabits.length} finished`
        : "Nothing scheduled today",
    },
  ];
  const goalConfettiProgress = useAnimatedValue(0);

  const goalConfettiStyles = useMemo(
    () =>
      GOAL_CONFETTI.map((piece) => {
        const travel = goalConfettiProgress.interpolate({
          inputRange: [0, 1],
          outputRange: [0, 1],
        });
        return {
          backgroundColor: piece.color,
          opacity: goalConfettiProgress.interpolate({
            inputRange: [0, 0.2, 1],
            outputRange: [0, 1, 0],
          }),
          transform: [
            {
              translateX: travel.interpolate({
                inputRange: [0, 1],
                outputRange: [0, piece.x],
              }),
            },
            {
              translateY: travel.interpolate({
                inputRange: [0, 1],
                outputRange: [0, piece.y],
              }),
            },
            {
              rotate: goalConfettiProgress.interpolate({
                inputRange: [0, 1],
                outputRange: ["0deg", piece.rotate],
              }),
            },
            {
              scale: goalConfettiProgress.interpolate({
                inputRange: [0, 0.2, 1],
                outputRange: [0.4, 1, 0.8],
              }),
            },
          ],
        };
      }),
    [goalConfettiProgress],
  );

  useEffect(() => {
    let cancelled = false;

    const loadBlockerState = async () => {
      if (!appBlocker.isSupported) {
        setBlockerStatus("Requires an iOS development build");
        return;
      }

      try {
        const [authorizationStatus, selection] = await Promise.all([
          appBlocker.getAuthorizationStatus(),
          appBlocker.getSelectionSummary(),
        ]);

        if (cancelled) return;

        setBlockerSelection(selection);
        setBlockerStatus(
          authorizationStatus === "approved"
            ? "Screen Time access approved"
            : "Screen Time access needed",
        );
      } catch {
        if (!cancelled) setBlockerStatus("Screen Time unavailable");
      }
    };

    loadBlockerState();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!appBlocker.isSupported || !hasBlockedAppSelection) return;

    let cancelled = false;

    const syncShield = async () => {
      try {
        if (appLockUnlocked) {
          await appBlocker.clearShield();
          if (!cancelled) setBlockerStatus("Shield removed");
          return;
        }

        await appBlocker.applyShield();
        if (!cancelled) setBlockerStatus("Shield active");
      } catch {
        if (!cancelled) setBlockerStatus("Open Screen Time setup");
      }
    };

    syncShield();

    return () => {
      cancelled = true;
    };
  }, [appLockUnlocked, hasBlockedAppSelection]);

  const configureScreenTimeLock = async () => {
    if (!appBlocker.isSupported) {
      setBlockerStatus("Use an iOS development build");
      return;
    }

    try {
      setBlockerStatus("Requesting Screen Time access...");
      await appBlocker.requestAuthorization();
      setBlockerStatus("Choose apps to block");
      setShowBlockerPicker(true);
    } catch {
      setBlockerStatus("Screen Time permission denied");
    }
  };

  const handleBlockerSelectionChange = (
    metadata: AppBlockerSelectionMetadata,
  ) => {
    const nextSelection = {
      supported: appBlocker.isSupported,
      applicationCount: metadata.applicationCount,
      categoryCount: metadata.categoryCount,
      webDomainCount: metadata.webDomainCount,
      hasSelection:
        metadata.applicationCount +
          metadata.categoryCount +
          metadata.webDomainCount >
        0,
    };

    setBlockerSelection(nextSelection);
    setBlockerStatus(
      nextSelection.hasSelection ? "Selection saved" : "No apps selected",
    );
  };

  const handleBlockerPickerDismiss = async () => {
    setShowBlockerPicker(false);

    try {
      const selection = await appBlocker.getSelectionSummary();
      setBlockerSelection(selection);
      if (selection.hasSelection && !appLockUnlocked) {
        await appBlocker.applyShield();
        setBlockerStatus("Shield active");
      } else {
        setBlockerStatus(selection.hasSelection ? "Ready" : "No apps selected");
      }
    } catch {
      setBlockerStatus("Screen Time setup failed");
    }
  };

  const playGoalConfetti = () => {
    goalConfettiProgress.stopAnimation();
    goalConfettiProgress.setValue(0);
    Animated.timing(goalConfettiProgress, {
      toValue: 1,
      duration: 700,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  };

  const toggleGoalComplete = async () => {
    if (isGoalComplete) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      await dailyFocusOps.markIncomplete();
      return;
    }

    if (!goalText) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      openGoalEditor();
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await dailyFocusOps.markComplete();
    playGoalConfetti();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const s = makeStyles(C);

  return (
    <View style={s.container}>
      <GradientBackground />
      <KeyboardAwareScrollView
        contentContainerStyle={[
          s.content,
          { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 96 },
        ]}
        bottomOffset={24}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={s.topHero}>
          <View style={s.sunDisc} />
          <View style={s.horizonShape} />
          <Text style={[s.bird, s.birdOne]}>⌒</Text>
          <Text style={[s.bird, s.birdTwo]}>⌒</Text>
          <Text style={[s.bird, s.birdThree]}>⌒</Text>

          <View style={s.header}>
            <View style={s.greetingRow}>
              <Ionicons name="sunny" size={26} color={palette.orange} />
              <Text style={s.greeting}>
                {getGreeting()}, {firstName}
              </Text>
            </View>
            <View style={s.affirmationLine}>
              <Text style={s.headerAffirmation} selectable>
                {dailyAffirmation?.text ?? "Preparing today's affirmation..."}
              </Text>
            </View>
          </View>

          <Text style={s.sectionLabel}>{"TODAY'S MAIN GOAL"}</Text>
          <View style={s.goalCard}>
            <View style={s.goalTopRow}>
              <View style={s.goalContent}>
                {editingGoal ? (
                  <TextInput
                    ref={goalInputRef}
                    style={s.goalInput}
                    value={goalDraft}
                    onChangeText={setGoalDraft}
                    onBlur={saveGoal}
                    placeholder="What's your main goal today?"
                    placeholderTextColor={C.textPlaceholder}
                    multiline
                  />
                ) : (
                  <Pressable onPress={openGoalEditor} hitSlop={10}>
                    <Text
                      style={goalText ? s.goalText : s.goalPlaceholderTitle}
                    >
                      {goalText || "Set one clear target"}
                    </Text>
                    {!goalText && (
                      <Text style={s.goalPlaceholderBody}>
                        Choose the main outcome you want this day to revolve
                        around.
                      </Text>
                    )}
                  </Pressable>
                )}
              </View>

              <Pressable
                style={s.goalRing}
                onPress={toggleGoalComplete}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel={
                  isGoalComplete
                    ? "Mark today's goal undone"
                    : "Mark today's goal done"
                }
              >
                <View
                  style={[
                    s.ringOuter,
                    !isGoalComplete && !goalText && s.ringOuterDisabled,
                  ]}
                >
                  <View
                    style={[s.ringInner, isGoalComplete && s.ringInnerDone]}
                  >
                    <Ionicons
                      name={isGoalComplete ? "checkmark" : "checkmark-outline"}
                      size={24}
                      color={isGoalComplete ? palette.white : palette.orange}
                    />
                  </View>
                </View>
                <View pointerEvents="none" style={s.goalConfettiLayer}>
                  {GOAL_CONFETTI.map((piece, index) => (
                    <Animated.View
                      key={`${piece.color}-${index}`}
                      style={[s.goalConfettiPiece, goalConfettiStyles[index]]}
                    />
                  ))}
                </View>
              </Pressable>
            </View>

            <Pressable
              style={[
                s.focusButton,
                !editingGoal && !goalText && s.focusButtonDisabled,
              ]}
              onPress={() => {
                if (editingGoal) {
                  saveGoal();
                  return;
                }

                if (goalText) {
                  router.push("/focus" as any);
                  return;
                }

                openGoalEditor();
              }}
            >
              <Ionicons
                name={editingGoal ? "save-outline" : "play"}
                size={16}
                color={palette.white}
              />
              <Text style={s.focusButtonText}>
                {editingGoal ? "Save" : "Start Focus"}
              </Text>
            </Pressable>
          </View>
        </View>

        <View style={s.section}>
          <Text style={s.sectionLabel}>{"HABITS"}</Text>
          <View style={s.card}>
            {todayHabits.length === 0 ? (
              <View style={s.emptyRow}>
                <Text style={s.emptyText}>No habits scheduled for today</Text>
              </View>
            ) : (
              todayHabits.map((habit, i) => {
                const done = doneIds.has(habit.id);
                return (
                  <View key={habit.id}>
                    {i > 0 && <View style={s.divider} />}
                    <Pressable
                      style={s.row}
                      onPress={() => toggleHabit(habit.id, done)}
                    >
                      <Ionicons
                        name={resolveIoniconName(habit.icon, "star-outline")}
                        size={22}
                        color={C.iconSecondary}
                        style={s.habitIcon}
                      />
                      <View style={s.rowInfo}>
                        <Text style={[s.rowTitle, done && s.rowTitleDone]}>
                          {habit.title}
                        </Text>
                        {habit.subtitle && (
                          <Text style={s.rowSubtitle}>{habit.subtitle}</Text>
                        )}
                      </View>
                      <View style={[s.checkbox, done && s.checkboxDone]}>
                        {done && (
                          <Ionicons
                            name="checkmark"
                            size={13}
                            color={palette.white}
                          />
                        )}
                      </View>
                    </Pressable>
                  </View>
                );
              })
            )}
          </View>
        </View>

        <View style={s.section}>
          <Text style={s.sectionLabel}>EVENING RESET</Text>
          <Pressable
            style={s.resetCard}
            onPress={() => {
              if (isEveningResetUnlocked) {
                router.push("/evening-reset" as any);
              } else {
                setShowResetLockMessage(true);
                setTimeout(() => setShowResetLockMessage(false), 5000);
              }
            }}
          >
            <View style={s.resetDecor}>
              <Image
                source={require("../../assets/evening.jpeg")}
                style={[
                  s.resetDecorImage,
                  !isEveningResetUnlocked && s.resetDecorLocked,
                ]}
                resizeMode="cover"
              />
              <View style={s.resetDecorOverlay} />
              <View style={s.resetCopy}>
                <View style={s.resetBadge}>
                  <Text style={s.resetBadgeText}>10 MIN RESET</Text>
                </View>
                <Text style={s.resetTitle}>Declutter before tomorrow</Text>
                <View>
                  <Text
                    style={[
                      s.resetBody,
                      showResetLockMessage && s.resetBodyHidden,
                    ]}
                  >
                    Clear your space, close the loop on today, and set up
                    tomorrow.
                  </Text>
                  {showResetLockMessage && (
                    <Text style={[s.resetLockMessage, StyleSheet.absoluteFill]}>
                      Available after 9 PM
                    </Text>
                  )}
                </View>
              </View>
              <View style={s.resetAction}>
                <Ionicons
                  name="chevron-forward"
                  size={18}
                  color={palette.white}
                />
              </View>
            </View>
          </Pressable>
        </View>

        <View style={s.section}>
          <Text style={s.sectionLabel}>ANTI-DOOMSCROLL LOCK</Text>
          <View style={[s.lockCard, appLockUnlocked && s.lockCardUnlocked]}>
            <View style={s.lockHeader}>
              <View style={[s.lockIcon, appLockUnlocked && s.lockIconUnlocked]}>
                <Ionicons
                  name={appLockUnlocked ? "lock-open" : "lock-closed"}
                  size={22}
                  color={appLockUnlocked ? palette.white : palette.orangeStrong}
                />
              </View>
              <View style={s.lockHeaderText}>
                <Text style={s.lockTitle}>
                  {appLockUnlocked
                    ? "Scroll apps unlocked"
                    : "Scroll apps stay locked"}
                </Text>
                <Text style={s.lockSubtitle}>
                  {hasBlockedAppSelection
                    ? blockerStatus
                    : "Pick distracting apps with Apple's Screen Time picker."}
                </Text>
              </View>
            </View>

            <View style={s.lockChecklist}>
              {lockBlockers.map((item, index) => (
                <View key={item.label}>
                  {index > 0 && <View style={s.lockDivider} />}
                  <View style={s.lockChecklistRow}>
                    <View style={[s.lockCheck, item.done && s.lockCheckDone]}>
                      {item.done && (
                        <Ionicons
                          name="checkmark"
                          size={13}
                          color={palette.white}
                        />
                      )}
                    </View>
                    <View style={s.lockChecklistText}>
                      <Text
                        style={[
                          s.lockChecklistTitle,
                          item.done && s.lockChecklistTitleDone,
                        ]}
                      >
                        {item.label}
                      </Text>
                      <Text style={s.lockChecklistDetail}>{item.detail}</Text>
                    </View>
                  </View>
                </View>
              ))}
            </View>

            <Pressable
              style={s.lockConfigureButton}
              onPress={configureScreenTimeLock}
              accessibilityRole="button"
              accessibilityLabel="Configure Screen Time app blocking"
            >
              <Ionicons
                name="options-outline"
                size={16}
                color={palette.white}
              />
              <Text style={s.lockConfigureText}>
                {hasBlockedAppSelection
                  ? "Change Blocked Apps"
                  : "Set Up Screen Time Lock"}
              </Text>
            </Pressable>
            {showBlockerPicker && (
              <AppBlockerSelectionSheet
                familyActivitySelectionId={APP_BLOCKER_SELECTION_ID}
                onDismissRequest={handleBlockerPickerDismiss}
                onSelectionChange={(event) =>
                  handleBlockerSelectionChange(event.nativeEvent)
                }
                style={s.lockPickerAnchor}
              />
            )}
          </View>
        </View>
      </KeyboardAwareScrollView>
    </View>
  );
}

function makeStyles(C: ReturnType<typeof import("@/hooks/useTheme").useTheme>) {
  return StyleSheet.create({
    container: { flex: 1 },
    content: { paddingHorizontal: 20 },

    topHero: {
      marginHorizontal: -20,
      marginTop: -16,
      marginBottom: 24,
      paddingHorizontal: 20,
      paddingTop: 16,
      paddingBottom: 22,
      backgroundColor: C.heroBg,
      overflow: "hidden",
    },
    sunDisc: {
      position: "absolute",
      width: 158,
      height: 158,
      borderRadius: 79,
      right: 54,
      top: 126,
      backgroundColor: C.accentBgSubtle,
    },
    horizonShape: {
      position: "absolute",
      width: 230,
      height: 98,
      borderTopLeftRadius: 115,
      borderTopRightRadius: 115,
      right: -80,
      bottom: 116,
      backgroundColor: C.accentBgSubtle,
    },
    bird: {
      position: "absolute",
      color: C.accentBorderSubtle,
      fontSize: 22,
      fontWeight: "700",
      transform: [{ rotate: "180deg" }],
    },
    birdOne: { right: 96, top: 24 },
    birdTwo: { right: 74, top: 48 },
    birdThree: { right: 42, top: 82 },
    header: {
      marginBottom: 34,
    },
    greetingRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      marginBottom: 12,
    },
    greeting: {
      fontSize: 24,
      fontWeight: "700",
      color: C.textPrimary,
    },
    affirmationLine: {
      maxWidth: 344,
      borderLeftWidth: 3,
      borderLeftColor: C.accentBorder,
      paddingLeft: 12,
    },
    headerAffirmation: {
      color: C.textSecondary,
      fontFamily: Fonts.rounded,
      fontSize: 16,
      fontWeight: "600",
      lineHeight: 23,
    },
    date: {
      fontSize: 16,
      color: C.textSecondary,
      fontWeight: "600",
    },

    section: { marginBottom: 24 },
    sectionLabel: {
      fontSize: 11,
      fontWeight: "700",
      letterSpacing: 1.5,
      color: C.textTertiary,
      marginBottom: 10,
    },
    goalCard: {
      backgroundColor: "rgba(255,255,255,0.2)",
      borderRadius: 16,
      borderWidth: 1,
      borderColor: C.cardBorder,
      padding: 20,
      shadowColor: "#000000",
      shadowOffset: { width: 0, height: 16 },
      shadowOpacity: 0.22,
      shadowRadius: 24,
      elevation: 8,
    },
    goalTopRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 16,
    },
    goalContent: { flex: 1 },
    goalText: {
      fontSize: 24,
      fontWeight: "700",
      color: C.textPrimary,
      lineHeight: 32,
    },
    goalInput: {
      fontSize: 23,
      fontWeight: "700",
      color: C.textPrimary,
      lineHeight: 31,
      minHeight: 68,
      padding: 0,
    },
    goalPlaceholderTitle: {
      fontSize: 23,
      fontWeight: "600",
      color: C.textPrimary,
      lineHeight: 31,
    },
    goalPlaceholderBody: {
      fontSize: 14,
      color: C.textTertiary,
      lineHeight: 20,
      marginTop: 6,
    },
    goalRing: {
      alignItems: "center",
      justifyContent: "center",
      position: "relative",
    },
    ringOuter: {
      width: 64,
      height: 64,
      borderRadius: 32,
      borderWidth: 5,
      borderColor: C.accentBorderSubtle,
      borderTopColor: palette.orange,
      borderRightColor: palette.orange,
      alignItems: "center",
      justifyContent: "center",
    },
    ringOuterDisabled: {
      opacity: 0.4,
    },
    ringInner: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: C.accentBgSubtle,
      alignItems: "center",
      justifyContent: "center",
    },
    ringInnerDone: {
      backgroundColor: palette.orangeStrong,
    },
    goalConfettiLayer: {
      position: "absolute",
      left: 32,
      top: 32,
      width: 1,
      height: 1,
      overflow: "visible",
    },
    goalConfettiPiece: {
      position: "absolute",
      width: 7,
      height: 12,
      borderRadius: 2,
    },
    focusButton: {
      height: 46,
      borderRadius: 12,
      backgroundColor: "#FF6B22",
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      marginTop: 20,
      shadowColor: "#FF6B22",
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.18,
      shadowRadius: 10,
      elevation: 3,
    },
    focusButtonDisabled: {
      backgroundColor: palette.orange,
    },
    focusButtonText: {
      color: palette.white,
      fontSize: 16,
      fontWeight: "600",
    },

    lockCard: {
      backgroundColor: C.cardBg,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: C.cardBorder,
      padding: 16,
      gap: 14,
    },
    lockCardUnlocked: {
      borderColor: C.accentBorder,
      backgroundColor: C.accentBgSubtle,
    },
    lockHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
    },
    lockIcon: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: C.accentBg,
      alignItems: "center",
      justifyContent: "center",
    },
    lockIconUnlocked: {
      backgroundColor: palette.orangeStrong,
    },
    lockHeaderText: {
      flex: 1,
      gap: 3,
    },
    lockTitle: {
      fontSize: 17,
      fontWeight: "800",
      color: C.textPrimary,
    },
    lockSubtitle: {
      fontSize: 13,
      lineHeight: 18,
      color: C.textTertiary,
    },
    lockAppRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
    },
    lockAppChip: {
      borderRadius: 999,
      borderWidth: 1,
      borderColor: C.divider,
      backgroundColor: C.inputBg,
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    lockAppChipUnlocked: {
      borderColor: C.accentBorder,
      backgroundColor: C.accentBg,
    },
    lockAppText: {
      fontSize: 12,
      fontWeight: "700",
      color: C.textSecondary,
    },
    lockAppTextUnlocked: {
      color: C.accentText,
    },
    lockChecklist: {
      borderRadius: 12,
      borderWidth: 1,
      borderColor: C.divider,
      overflow: "hidden",
    },
    lockChecklistRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingHorizontal: 12,
      paddingVertical: 11,
    },
    lockDivider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: C.divider,
      marginLeft: 44,
    },
    lockCheck: {
      width: 22,
      height: 22,
      borderRadius: 11,
      borderWidth: 1.5,
      borderColor: C.iconTertiary,
      alignItems: "center",
      justifyContent: "center",
    },
    lockCheckDone: {
      backgroundColor: palette.orangeStrong,
      borderColor: palette.orangeStrong,
    },
    lockChecklistText: {
      flex: 1,
      gap: 2,
    },
    lockChecklistTitle: {
      fontSize: 14,
      fontWeight: "700",
      color: C.textPrimary,
    },
    lockChecklistTitleDone: {
      color: C.textTertiary,
    },
    lockChecklistDetail: {
      fontSize: 12,
      color: C.textQuaternary,
    },
    lockConfigureButton: {
      height: 42,
      borderRadius: 12,
      backgroundColor: palette.orangeStrong,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
    },
    lockConfigureText: {
      color: palette.white,
      fontSize: 14,
      fontWeight: "700",
    },
    lockPickerAnchor: {
      position: "absolute",
      width: 1,
      height: 1,
      opacity: 0,
    },

    card: {
      backgroundColor: C.cardBg,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: C.cardBorder,
      overflow: "hidden",
    },
    divider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: C.divider,
      marginHorizontal: 16,
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 14,
      paddingHorizontal: 16,
      gap: 12,
    },
    habitIcon: { width: 28, textAlign: "center" },
    rowInfo: { flex: 1 },
    rowTitle: { fontSize: 15, fontWeight: "600", color: C.textPrimary },
    rowTitleDone: { color: C.textTertiary, textDecorationLine: "line-through" },
    rowSubtitle: { fontSize: 12, color: C.textQuaternary, marginTop: 2 },
    checkbox: {
      width: 20,
      height: 20,
      borderRadius: 10,
      borderWidth: 1.5,
      borderColor: C.iconTertiary,
      alignItems: "center",
      justifyContent: "center",
    },
    checkboxDone: {
      backgroundColor: palette.orangeStrong,
      borderColor: palette.orangeStrong,
    },
    emptyRow: { paddingVertical: 20, paddingHorizontal: 16 },
    emptyText: { fontSize: 14, color: C.textQuaternary, textAlign: "center" },

    resetCard: {
      backgroundColor: "#05070A",
      borderRadius: 22,
      borderWidth: 1,
      borderColor: C.accentBorderSubtle,
      overflow: "hidden",
    },
    resetCopy: {
      position: "absolute",
      left: 18,
      right: 18,
      bottom: 18,
    },
    resetDecor: {
      height: 190,
      justifyContent: "flex-end",
      overflow: "hidden",
    },
    resetDecorLocked: {
      opacity: 0.4,
    },
    resetBodyHidden: {
      opacity: 0,
    },
    resetLockMessage: {
      color: "rgba(255,179,102,0.85)",
      fontSize: 14,
      fontWeight: "600",
      lineHeight: 21,
    },
    resetDecorImage: {
      width: "100%",
      height: "100%",
    },
    resetDecorOverlay: {
      ...StyleSheet.absoluteFill,
      backgroundColor: "rgba(5,7,10,0.34)",
    },
    resetBadge: {
      alignSelf: "flex-start",
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 999,
      backgroundColor: "rgba(8,10,14,0.5)",
      borderWidth: 1,
      borderColor: C.accentBorderSubtle,
      marginBottom: 12,
    },
    resetBadgeText: {
      color: palette.orange,
      fontSize: 11,
      fontWeight: "800",
      letterSpacing: 1,
    },
    resetTitle: {
      color: palette.white,
      fontSize: 24,
      fontWeight: "800",
      lineHeight: 30,
      marginBottom: 10,
    },
    resetBody: {
      color: "rgba(255,255,255,0.78)",
      fontSize: 14,
      lineHeight: 21,
      maxWidth: 260,
    },
    resetAction: {
      position: "absolute",
      right: 16,
      bottom: 16,
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: palette.orange,
      alignItems: "center",
      justifyContent: "center",
    },
  });
}
