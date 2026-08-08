import GradientBackground from "@/components/GradientBackground";
import { HabitHeatmap } from "@/components/HabitHeatmap";
import { Collapsible } from "@/components/ui/collapsible";
import { useTheme } from "@/hooks/useTheme";
import {
  db,
  habits,
  habitCompletions,
  dailyFocus,
  challenges,
  completionOps,
  habitOps,
  challengeOps,
} from "@/lib/db";
import { KEYSTONE_HABITS_BY_FOCUS } from "@/hooks/useOnboarding";
import { getTodayInLocalTimezone, getLocalDateString } from "@/lib/timezone";
import { useLiveQuery } from "drizzle-orm/expo-sqlite";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useMemo, useState } from "react";
import Svg, { Circle } from "react-native-svg";
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { DAY_NAMES } from "@/lib/performance";
import { resolveIoniconName, type IoniconName } from "@/lib/iconNames";

const ALL_DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
const DAY_LABELS: Record<string, string> = {
  mon: "M", tue: "T", wed: "W", thu: "T", fri: "F", sat: "S", sun: "S",
};

const ICON_OPTIONS: IoniconName[] = [
  "star-outline", "flame-outline", "flash-outline", "leaf-outline", "heart-outline",
  "walk-outline", "water-outline", "bed-outline", "body-outline", "journal-outline",
  "book-outline", "pencil-outline", "barbell-outline", "bicycle-outline", "nutrition-outline",
  "musical-notes-outline", "code-slash-outline", "bulb-outline", "camera-outline",
  "timer-outline", "cash-outline", "stats-chart-outline", "person-outline", "earth-outline",
];

function AddCustomHabitModal({
  visible,
  onClose,
  onSave,
}: {
  visible: boolean;
  onClose: () => void;
  onSave: (title: string, subtitle: string, icon: IoniconName, days: string[]) => Promise<void>;
}) {
  const C = useTheme();
  const insets = useSafeAreaInsets();
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [selectedIcon, setSelectedIcon] = useState<IoniconName>("star-outline");
  const [selectedDays, setSelectedDays] = useState<string[]>([...ALL_DAYS]);
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setTitle("");
    setSubtitle("");
    setSelectedIcon("star-outline");
    setSelectedDays([...ALL_DAYS]);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSave = async () => {
    const trimmed = title.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    try {
      await onSave(trimmed, subtitle.trim(), selectedIcon, selectedDays);
      reset();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const toggleDay = (day: string) => {
    setSelectedDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day],
    );
  };

  const ms = makeModalStyles(C);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={[ms.sheet, { paddingBottom: insets.bottom + 24 }]}>
          <View style={ms.handle} />
          <View style={ms.header}>
            <Pressable onPress={handleClose} style={ms.headerBtn}>
              <Text style={ms.cancelText}>Cancel</Text>
            </Pressable>
            <Text style={ms.headerTitle}>New Habit</Text>
            <Pressable
              onPress={handleSave}
              style={[ms.headerBtn, ms.saveBtn, (!title.trim() || saving) && ms.saveBtnDisabled]}
              disabled={!title.trim() || saving}
            >
              <Text style={[ms.saveText, (!title.trim() || saving) && ms.saveTextDisabled]}>Save</Text>
            </Pressable>
          </View>

          <ScrollView style={ms.scroll} showsVerticalScrollIndicator={false}>
            <View style={ms.section}>
              <Text style={ms.label}>HABIT NAME</Text>
              <TextInput
                style={ms.input}
                placeholder="e.g. Morning run"
                placeholderTextColor={C.textQuaternary}
                value={title}
                onChangeText={setTitle}
                maxLength={60}
                autoFocus
              />
            </View>

            <View style={ms.section}>
              <Text style={ms.label}>DESCRIPTION (OPTIONAL)</Text>
              <TextInput
                style={ms.input}
                placeholder="e.g. 20 minutes"
                placeholderTextColor={C.textQuaternary}
                value={subtitle}
                onChangeText={setSubtitle}
                maxLength={80}
              />
            </View>

            <View style={ms.section}>
              <Text style={ms.label}>ICON</Text>
              <View style={ms.iconGrid}>
                {ICON_OPTIONS.map((icon) => (
                  <Pressable
                    key={icon}
                    style={[ms.iconCell, selectedIcon === icon && ms.iconCellSelected]}
                    onPress={() => setSelectedIcon(icon)}
                  >
                    <Ionicons
                      name={icon}
                      size={22}
                      color={selectedIcon === icon ? C.accentText : C.iconSecondary}
                    />
                  </Pressable>
                ))}
              </View>
            </View>

            <View style={ms.section}>
              <Text style={ms.label}>DAYS</Text>
              <View style={ms.daysRow}>
                {ALL_DAYS.map((day) => (
                  <Pressable
                    key={day}
                    style={[ms.dayPill, selectedDays.includes(day) && ms.dayPillActive]}
                    onPress={() => toggleDay(day)}
                  >
                    <Text style={[ms.dayPillText, selectedDays.includes(day) && ms.dayPillTextActive]}>
                      {DAY_LABELS[day]}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function makeModalStyles(C: ReturnType<typeof import("@/hooks/useTheme").useTheme>) {
  return StyleSheet.create({
    sheet: {
      flex: 1,
      backgroundColor: C.background,
      paddingHorizontal: 20,
      paddingTop: 12,
    },
    handle: {
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: C.cardBorder,
      alignSelf: "center",
      marginBottom: 16,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 28,
    },
    headerTitle: {
      fontSize: 16,
      fontWeight: "700",
      color: C.textPrimary,
    },
    headerBtn: { minWidth: 60 },
    cancelText: { fontSize: 15, color: C.textSecondary },
    saveBtn: { alignItems: "flex-end" },
    saveText: { fontSize: 15, fontWeight: "700", color: C.accentText },
    saveBtnDisabled: {},
    saveTextDisabled: { color: C.textQuaternary },
    scroll: { flex: 1 },
    section: { marginBottom: 24 },
    label: {
      fontSize: 11,
      fontWeight: "700",
      letterSpacing: 1.5,
      color: C.textTertiary,
      marginBottom: 10,
    },
    input: {
      backgroundColor: C.cardBg,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: C.cardBorder,
      paddingHorizontal: 14,
      paddingVertical: 13,
      fontSize: 15,
      color: C.textPrimary,
    },
    iconGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 10,
    },
    iconCell: {
      width: 48,
      height: 48,
      borderRadius: 12,
      backgroundColor: C.cardBg,
      borderWidth: 1,
      borderColor: C.cardBorder,
      alignItems: "center",
      justifyContent: "center",
    },
    iconCellSelected: {
      borderColor: C.accentBorder,
      backgroundColor: C.accentBg,
    },
    daysRow: {
      flexDirection: "row",
      gap: 8,
    },
    dayPill: {
      flex: 1,
      height: 40,
      borderRadius: 10,
      backgroundColor: C.cardBg,
      borderWidth: 1,
      borderColor: C.cardBorder,
      alignItems: "center",
      justifyContent: "center",
    },
    dayPillActive: {
      borderColor: C.accentBorder,
      backgroundColor: C.accentBg,
    },
    dayPillText: {
      fontSize: 12,
      fontWeight: "700",
      color: C.textQuaternary,
    },
    dayPillTextActive: {
      color: C.accentText,
    },
  });
}

const FOCUS_LABELS: Record<string, string> = {
  health: "Health & Vitality",
  mindset: "Mindset & Growth",
  work: "Work & Business",
  relations: "Relationships",
  creative: "Creativity",
  finance: "Financial Freedom",
};
const FOCUS_ICONS: Record<string, React.ComponentProps<typeof Ionicons>["name"]> = {
  health: "star-outline",
  mindset: "person-outline",
  work: "briefcase-outline",
  relations: "heart-outline",
  creative: "sparkles-outline",
  finance: "cash-outline",
};
const PROGRESS_RING_SIZE = 148;
const PROGRESS_RING_STROKE = 12;
const PROGRESS_RING_RADIUS = (PROGRESS_RING_SIZE - PROGRESS_RING_STROKE) / 2;
const PROGRESS_RING_CIRCUMFERENCE = 2 * Math.PI * PROGRESS_RING_RADIUS;

function habitKey(title: string, subtitle?: string | null) {
  return `${title}::${subtitle ?? ""}`;
}

function parseDateKey(key: string): Date {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}

const MAIN_GOAL_HABIT_ID = -1;
const EVENING_RESET_HABIT_ID = -2;
const ALL_DAYS_LIST = [...ALL_DAYS];

export default function RoutinesScreen() {
  const insets = useSafeAreaInsets();
  const C = useTheme();
  const today = useMemo(() => getTodayInLocalTimezone(), []);
  const todayKey = getLocalDateString(today);
  const todayName = DAY_NAMES[today.getDay()];
  const [expandedHabitId, setExpandedHabitId] = useState<number | null>(null);
  const [addModalVisible, setAddModalVisible] = useState(false);

  const { data: allHabits } = useLiveQuery(db.select().from(habits));
  const { data: allCompletions } = useLiveQuery(db.select().from(habitCompletions));
  const { data: allFocusRows } = useLiveQuery(db.select().from(dailyFocus));
  const { data: activeChallenges } = useLiveQuery(db.select().from(challenges));

  const specialHabits = useMemo(() => {
    const rows = allFocusRows ?? [];
    const earliestCreatedAt = rows.reduce<Date | null>((earliest, row) => {
      const createdAt = new Date(row.createdAt);
      return !earliest || createdAt < earliest ? createdAt : earliest;
    }, null);
    const createdAt = earliestCreatedAt ?? today;

    return [
      {
        id: MAIN_GOAL_HABIT_ID,
        title: "Main Goal",
        subtitle: "Daily focus",
        icon: "flag-outline" as IoniconName,
        daysOfWeek: ALL_DAYS_LIST,
        isLocked: true,
        sortOrder: -2,
        createdAt,
      },
      {
        id: EVENING_RESET_HABIT_ID,
        title: "Evening Reset",
        subtitle: "Wind down",
        icon: "moon-outline" as IoniconName,
        daysOfWeek: ALL_DAYS_LIST,
        isLocked: true,
        sortOrder: -1,
        createdAt,
      },
    ];
  }, [allFocusRows, today]);

  const specialCompletions = useMemo(() => {
    const rows = allFocusRows ?? [];
    const list: { habitId: number; date: string; status: string }[] = [];
    for (const row of rows) {
      if (row.completedAt) {
        list.push({ habitId: MAIN_GOAL_HABIT_ID, date: row.date, status: "done" });
      }
      if (row.eveningResetCompletedAt) {
        list.push({ habitId: EVENING_RESET_HABIT_ID, date: row.date, status: "done" });
      }
    }
    return list;
  }, [allFocusRows]);

  const allHabitsWithSpecial = useMemo(
    () => [...specialHabits, ...(allHabits ?? [])],
    [specialHabits, allHabits],
  );
  const allCompletionsWithSpecial = useMemo(
    () => [...specialCompletions, ...(allCompletions ?? [])],
    [specialCompletions, allCompletions],
  );

  const focusEntries = useMemo(
    () => Object.entries(KEYSTONE_HABITS_BY_FOCUS),
    [],
  );
  const existingHabitMap = useMemo(() => {
    const map = new Map<string, NonNullable<typeof allHabits>[number]>();
    for (const habit of allHabits ?? []) {
      map.set(habitKey(habit.title, habit.subtitle), habit);
    }
    return map;
  }, [allHabits]);

  const todayHabits = useMemo(() => {
    const list = allHabits ?? [];
    return list.filter((h) => (h.daysOfWeek as string[]).includes(todayName));
  }, [allHabits, todayName]);

  const doneIds = useMemo(() => {
    const set = new Set<number>();
    for (const c of allCompletionsWithSpecial) {
      if (c.date === todayKey && c.status === "done") set.add(c.habitId);
    }
    return set;
  }, [allCompletionsWithSpecial, todayKey]);

  const skippedIds = useMemo(() => {
    const set = new Set<number>();
    for (const c of allCompletions ?? []) {
      if (c.date === todayKey && c.status === "skipped") set.add(c.habitId);
    }
    return set;
  }, [allCompletions, todayKey]);

  const streakMap = useMemo(() => {
    const map: Record<number, number> = {};
    for (const h of allHabitsWithSpecial) {
      const dates = allCompletionsWithSpecial
        .filter((c) => c.habitId === h.id && c.status === "done")
        .map((c) => c.date)
        .sort()
        .reverse();

      let streak = 0;
      const cursor = new Date(today);
      cursor.setDate(cursor.getDate() - 1);

      for (let i = 0; i < 365; i++) {
        const key = getLocalDateString(cursor);
        if (dates.includes(key)) {
          streak++;
          cursor.setDate(cursor.getDate() - 1);
        } else break;
      }
      if (doneIds.has(h.id)) streak++;
      map[h.id] = streak;
    }
    return map;
  }, [allHabitsWithSpecial, allCompletionsWithSpecial, doneIds, today]);

  const bestStreakMap = useMemo(() => {
    const map: Record<number, number> = {};
    for (const h of allHabitsWithSpecial) {
      const dates = allCompletionsWithSpecial
        .filter((c) => c.habitId === h.id && c.status === "done")
        .map((c) => c.date)
        .sort();

      let best = 0;
      let current = 0;
      for (let i = 0; i < dates.length; i++) {
        if (i === 0) {
          current = 1;
        } else {
          const prev = new Date(dates[i - 1]);
          prev.setDate(prev.getDate() + 1);
          current = getLocalDateString(prev) === dates[i] ? current + 1 : 1;
        }
        if (current > best) best = current;
      }
      map[h.id] = Math.max(best, streakMap[h.id] ?? 0);
    }
    return map;
  }, [allHabitsWithSpecial, allCompletionsWithSpecial, streakMap]);

  const totalDoneMap = useMemo(() => {
    const map: Record<number, number> = {};
    for (const c of allCompletionsWithSpecial) {
      if (c.status === "done") map[c.habitId] = (map[c.habitId] ?? 0) + 1;
    }
    return map;
  }, [allCompletionsWithSpecial]);

  const todayProgress = useMemo(() => {
    const completed = todayHabits.filter((habit) => doneIds.has(habit.id)).length;
    const skipped = todayHabits.filter((habit) => skippedIds.has(habit.id)).length;
    const total = todayHabits.length;
    const ratio = total > 0 ? completed / total : 0;
    const doneByDate = new Set(
      (allCompletions ?? [])
        .filter((item) => item.status === "done")
        .map((item) => item.date),
    );

    let dayStreak = 0;
    const cursor = new Date(today);
    while (doneByDate.has(getLocalDateString(cursor))) {
      dayStreak += 1;
      cursor.setDate(cursor.getDate() - 1);
    }

    return { completed, skipped, total, ratio, dayStreak };
  }, [allCompletions, doneIds, skippedIds, today, todayHabits]);

  const progressOffset = PROGRESS_RING_CIRCUMFERENCE * (1 - todayProgress.ratio);

  const toggle = async (habitId: number, isDone: boolean) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (isDone) {
      await completionOps.markUndone(habitId, today);
    } else {
      await completionOps.markDone(habitId, today);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  };

  const addCustomHabit = async (
    title: string,
    subtitle: string,
    icon: IoniconName,
    days: string[],
  ) => {
    await habitOps.create({
      title,
      subtitle: subtitle || null,
      icon,
      daysOfWeek: days,
      isLocked: false,
      sortOrder: (allHabits?.length ?? 0) + 1,
    });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const endChallenge = (id: number, title: string) => {
    Alert.alert(
      `End "${title}"?`,
      "Its habits will stay in Active Habits — only the challenge countdown ends.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "End Challenge",
          style: "destructive",
          onPress: () => challengeOps.end(id),
        },
      ],
    );
  };

  const s = makeStyles(C);

  return (
    <View style={s.container}>
      <GradientBackground />
      <ScrollView
        contentContainerStyle={[
          s.content,
          { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 96 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={s.section}>
          <Text style={s.sectionLabel}>TODAY&apos;S PROGRESS</Text>
          <View style={s.progressCard}>
            <View style={s.progressRingWrap}>
              <Svg width={PROGRESS_RING_SIZE} height={PROGRESS_RING_SIZE}>
                <Circle
                  cx={PROGRESS_RING_SIZE / 2}
                  cy={PROGRESS_RING_SIZE / 2}
                  r={PROGRESS_RING_RADIUS}
                  stroke={C.cardBorder}
                  strokeWidth={PROGRESS_RING_STROKE}
                  fill="none"
                />
                <Circle
                  cx={PROGRESS_RING_SIZE / 2}
                  cy={PROGRESS_RING_SIZE / 2}
                  r={PROGRESS_RING_RADIUS}
                  stroke={C.accent}
                  strokeWidth={PROGRESS_RING_STROKE}
                  strokeLinecap="round"
                  strokeDasharray={PROGRESS_RING_CIRCUMFERENCE}
                  strokeDashoffset={progressOffset}
                  fill="none"
                  rotation="-90"
                  originX={PROGRESS_RING_SIZE / 2}
                  originY={PROGRESS_RING_SIZE / 2}
                />
              </Svg>
              <View style={s.progressRingCenter}>
                <Text style={s.progressValue}>
                  {todayProgress.completed}/{todayProgress.total}
                </Text>
                <Text style={s.progressValueLabel}>Completed</Text>
              </View>
            </View>

            <View style={s.progressStats}>
              <View style={s.progressStatRow}>
                <View style={s.progressStatIconWrap}>
                  <Ionicons name="checkmark-circle-outline" size={18} color={C.iconSecondary} />
                </View>
                <View>
                  <Text style={s.progressStatValue}>{todayProgress.completed}</Text>
                  <Text style={s.progressStatLabel}>Completed</Text>
                </View>
              </View>

              <View style={s.progressStatRow}>
                <View style={s.progressStatIconWrap}>
                  <Ionicons name="play-skip-forward-outline" size={18} color={C.iconSecondary} />
                </View>
                <View>
                  <Text style={s.progressStatValue}>{todayProgress.skipped}</Text>
                  <Text style={s.progressStatLabel}>Skipped</Text>
                </View>
              </View>

              <View style={s.progressStatRow}>
                <View style={s.progressStatIconWrap}>
                  <Ionicons name="flame-outline" size={18} color={C.iconSecondary} />
                </View>
                <View>
                  <Text style={s.progressStatValue}>{todayProgress.dayStreak}</Text>
                  <Text style={s.progressStatLabel}>Streaks</Text>
                </View>
              </View>
            </View>
          </View>
        </View>

        <View style={s.section}>
          <Text style={s.sectionLabel}>DAILY</Text>
          <View style={s.habitList}>
            {specialHabits.map((habit) => {
              const streak = streakMap[habit.id] ?? 0;
              const streakDots = Math.min(streak, 10);
              const isDone = doneIds.has(habit.id);
              return (
                <View key={habit.id} style={s.habitCard}>
                  <View style={s.habitCardRow}>
                    <View style={s.habitIconWrap}>
                      <Ionicons
                        name={resolveIoniconName(habit.icon, "star-outline")}
                        size={22}
                        color={C.iconSecondary}
                      />
                    </View>
                    <View style={s.habitInfo}>
                      <Text style={s.habitTitle} numberOfLines={1}>
                        {habit.title}
                      </Text>
                      <View style={s.streakDotsRow}>
                        {Array.from({ length: 10 }).map((_, index) => (
                          <View
                            key={`${habit.id}-dot-${index}`}
                            style={[
                              s.streakDot,
                              index < streakDots && s.streakDotActive,
                            ]}
                          />
                        ))}
                      </View>
                    </View>
                    <View style={s.streakBadge}>
                      <View style={s.streakValueRow}>
                        <Ionicons name="flame" size={14} color={C.accentText} />
                        <Text style={s.streakText}>{streak}</Text>
                      </View>
                      <Text style={s.streakLabel}>day streak</Text>
                    </View>
                    {isDone && (
                      <Ionicons name="checkmark-circle" size={18} color={C.accentText} />
                    )}
                  </View>
                  <HabitHeatmap
                    habitId={habit.id}
                    daysOfWeek={habit.daysOfWeek}
                    completions={specialCompletions}
                    today={today}
                    createdAt={habit.createdAt}
                    bestStreak={bestStreakMap[habit.id] ?? 0}
                    totalDone={totalDoneMap[habit.id] ?? 0}
                  />
                </View>
              );
            })}
          </View>
        </View>

        <View style={s.section}>
          <View style={s.sectionLabelRow}>
            <Text style={s.sectionLabel}>CHALLENGES</Text>
            <Pressable
              style={s.addHabitInlineBtn}
              onPress={() => router.push("/challenges")}
            >
              <Ionicons name="add" size={14} color={C.accentText} />
              <Text style={s.addHabitInlineBtnText}>Start</Text>
            </Pressable>
          </View>
          {(activeChallenges ?? []).length > 0 ? (
            <View style={s.habitList}>
              {(activeChallenges ?? []).map((challenge) => {
                const startDateObj = parseDateKey(challenge.startDate);
                const daysElapsed = Math.round(
                  (today.getTime() - startDateObj.getTime()) / 86400000,
                );
                const dayNumber = Math.min(daysElapsed + 1, challenge.durationDays);
                const isComplete = daysElapsed >= challenge.durationDays;
                const progress = Math.max(0, Math.min(dayNumber / challenge.durationDays, 1));
                return (
                  <View key={challenge.id} style={s.habitCard}>
                    <View style={s.habitCardRow}>
                      <View style={s.habitIconWrap}>
                        <Ionicons
                          name={resolveIoniconName(challenge.icon, "flame-outline")}
                          size={22}
                          color={C.accentText}
                        />
                      </View>
                      <View style={s.habitInfo}>
                        <Text style={s.habitTitle} numberOfLines={1}>
                          {challenge.title}
                        </Text>
                        <Text style={s.habitDuration}>
                          {isComplete
                            ? "Complete"
                            : `Day ${dayNumber} of ${challenge.durationDays}`}
                        </Text>
                      </View>
                      <Pressable
                        onPress={() => endChallenge(challenge.id, challenge.title)}
                        hitSlop={12}
                        accessibilityRole="button"
                        accessibilityLabel="End challenge"
                      >
                        <Ionicons name="close-circle-outline" size={20} color={C.textQuaternary} />
                      </Pressable>
                    </View>
                    <View style={s.challengeProgressTrack}>
                      <View style={[s.challengeProgressFill, { width: `${progress * 100}%` }]} />
                    </View>
                  </View>
                );
              })}
            </View>
          ) : (
            <Pressable style={s.emptyChallengeCard} onPress={() => router.push("/challenges")}>
              <Ionicons name="flag-outline" size={18} color={C.iconSecondary} />
              <Text style={s.emptyChallengeText}>Try a preset challenge like 75 Hard</Text>
              <Ionicons name="chevron-forward" size={16} color={C.textQuaternary} />
            </Pressable>
          )}
        </View>

        <View style={s.section}>
          <View style={s.sectionLabelRow}>
            <Text style={s.sectionLabel}>ACTIVE HABITS</Text>
            <Pressable style={s.addHabitInlineBtn} onPress={() => setAddModalVisible(true)}>
              <Ionicons name="add" size={14} color={C.accentText} />
              <Text style={s.addHabitInlineBtnText}>Add</Text>
            </Pressable>
          </View>
          {todayHabits.length > 0 && (
            <View style={s.habitList}>
              {todayHabits.map((habit) => {
                const streak = streakMap[habit.id] ?? 0;
                const streakDots = Math.min(streak, 10);
                const isExpanded = expandedHabitId === habit.id;
                return (
                  <View key={habit.id} style={s.habitCard}>
                    <Pressable
                      style={s.habitCardRow}
                      onPress={() => toggle(habit.id, doneIds.has(habit.id))}
                      onLongPress={() => setExpandedHabitId(isExpanded ? null : habit.id)}
                    >
                      <View style={s.habitIconWrap}>
                        <Ionicons
                          name={resolveIoniconName(habit.icon, "star-outline")}
                          size={22}
                          color={C.iconSecondary}
                        />
                      </View>
                      <View style={s.habitInfo}>
                        <Text style={s.habitTitle} numberOfLines={1}>
                          {habit.title}
                        </Text>
                        {habit.subtitle ? (
                          <Text style={s.habitDuration} numberOfLines={1}>
                            {habit.subtitle}
                          </Text>
                        ) : null}
                        <View style={s.streakDotsRow}>
                          {Array.from({ length: 10 }).map((_, index) => (
                            <View
                              key={`${habit.id}-dot-${index}`}
                              style={[
                                s.streakDot,
                                index < streakDots && s.streakDotActive,
                              ]}
                            />
                          ))}
                        </View>
                      </View>
                      <View style={s.streakBadge}>
                        <View style={s.streakValueRow}>
                          <Ionicons name="flame" size={14} color={C.accentText} />
                          <Text style={s.streakText}>{streak}</Text>
                        </View>
                      </View>
                      <Pressable
                        style={s.expandBtn}
                        onPress={() => setExpandedHabitId(isExpanded ? null : habit.id)}
                        hitSlop={12}
                        accessibilityRole="button"
                        accessibilityLabel={isExpanded ? "Hide habit details" : "Show habit details"}
                      >
                        <Ionicons
                          name={isExpanded ? "chevron-up" : "chevron-down"}
                          size={14}
                          color={C.textQuaternary}
                        />
                      </Pressable>
                    </Pressable>
                    {isExpanded && (
                      <HabitHeatmap
                        habitId={habit.id}
                        daysOfWeek={habit.daysOfWeek as string[]}
                        completions={allCompletions ?? []}
                        today={today}
                        createdAt={habit.createdAt}
                        bestStreak={bestStreakMap[habit.id] ?? 0}
                        totalDone={totalDoneMap[habit.id] ?? 0}
                      />
                    )}
                  </View>
                );
              })}
            </View>
          )}
        </View>

        <View style={s.section}>
          <Text style={s.sectionLabel}>SUGGESTIONS</Text>
          <View style={s.focusGroupsList}>
            {focusEntries.map(([focusKey, focusHabits]) => (
              <View key={focusKey} style={s.focusGroupCard}>
                <Collapsible
                  title={FOCUS_LABELS[focusKey] ?? focusKey}
                  headerContent={
                    <View style={s.focusGroupHeaderContent}>
                      <View style={s.focusGroupHeaderIconWrap}>
                        <Ionicons
                          name={FOCUS_ICONS[focusKey] ?? "ellipse-outline"}
                          size={20}
                          color={C.iconSecondary}
                        />
                      </View>
                      <Text style={s.focusGroupTitle}>{FOCUS_LABELS[focusKey] ?? focusKey}</Text>
                    </View>
                  }
                  contentStyle={s.focusGroupContent}
                >
                  <View style={s.focusGroupItems}>
                    {focusHabits.map((habit) => {
                      const isOwned = existingHabitMap.has(habitKey(habit.title, habit.subtitle));
                      return (
                        <View key={`${focusKey}-${habit.title}`} style={s.focusGroupItem}>
                          <Ionicons
                            name={resolveIoniconName(habit.icon, "star-outline")}
                            size={16}
                            color={C.iconSecondary}
                            style={s.focusGroupIcon}
                          />
                          <Text style={s.focusGroupItemText} numberOfLines={1}>
                            {habit.title}
                          </Text>
                          {isOwned && (
                            <Ionicons name="checkmark-circle" size={14} color={C.accentText} />
                          )}
                        </View>
                      );
                    })}
                  </View>
                </Collapsible>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>

      <AddCustomHabitModal
        visible={addModalVisible}
        onClose={() => setAddModalVisible(false)}
        onSave={addCustomHabit}
      />
    </View>
  );
}

function makeStyles(C: ReturnType<typeof import("@/hooks/useTheme").useTheme>) {
  return StyleSheet.create({
    container: { flex: 1 },
    content: {
      paddingHorizontal: 20,
      gap: 24,
    },
    section: { gap: 12 },
    sectionLabelRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    sectionLabel: {
      fontSize: 11,
      fontWeight: "700",
      letterSpacing: 1.5,
      color: C.textTertiary,
    },
    addHabitInlineBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      backgroundColor: C.accentBg,
      borderWidth: 1,
      borderColor: C.accentBorder,
      borderRadius: 20,
      paddingHorizontal: 10,
      paddingVertical: 4,
    },
    addHabitInlineBtnText: {
      fontSize: 12,
      fontWeight: "700",
      color: C.accentText,
    },
    card: {
      backgroundColor: C.cardBg,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: C.cardBorder,
      padding: 16,
    },
    progressCard: {
      backgroundColor: C.cardBg,
      borderRadius: 24,
      borderWidth: 1,
      borderColor: C.cardBorder,
      paddingHorizontal: 18,
      paddingVertical: 20,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 18,
    },
    progressRingWrap: {
      width: PROGRESS_RING_SIZE,
      height: PROGRESS_RING_SIZE,
      alignItems: "center",
      justifyContent: "center",
      position: "relative",
    },
    progressRingCenter: {
      position: "absolute",
      alignItems: "center",
      justifyContent: "center",
    },
    progressValue: {
      fontSize: 23,
      fontWeight: "700",
      color: C.textPrimary,
      letterSpacing: -0.4,
    },
    progressValueLabel: {
      marginTop: 4,
      fontSize: 13,
      color: C.textSecondary,
      fontWeight: "500",
    },
    progressStats: {
      flex: 1,
      minWidth: 116,
      gap: 18,
    },
    progressStatRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
    },
    progressStatIconWrap: {
      width: 28,
      height: 28,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: C.cardBorder,
      backgroundColor: C.inputBg,
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
    },
    progressStatValue: {
      fontSize: 18,
      fontWeight: "700",
      color: C.textPrimary,
      lineHeight: 20,
    },
    progressStatLabel: {
      marginTop: 2,
      fontSize: 14,
      color: C.textSecondary,
      lineHeight: 18,
    },
    habitList: { gap: 10 },
    challengeProgressTrack: {
      height: 6,
      borderRadius: 999,
      backgroundColor: C.inputBg,
      overflow: "hidden",
      marginTop: 14,
    },
    challengeProgressFill: {
      height: "100%",
      borderRadius: 999,
      backgroundColor: C.accent,
    },
    emptyChallengeCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      backgroundColor: C.cardBg,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: C.cardBorder,
      paddingHorizontal: 16,
      paddingVertical: 16,
    },
    emptyChallengeText: {
      flex: 1,
      fontSize: 14,
      fontWeight: "500",
      color: C.textSecondary,
    },
    habitCard: {
      backgroundColor: C.cardBg,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: C.cardBorder,
      paddingHorizontal: 16,
      paddingVertical: 16,
    },
    habitCardRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
    },
    habitIconWrap: {
      width: 28,
      alignItems: "center",
      justifyContent: "center",
    },
    habitInfo: { flex: 1 },
    habitTitle: { fontSize: 15, fontWeight: "600", color: C.textPrimary },
    habitDuration: {
      fontSize: 13,
      fontWeight: "500",
      color: C.textQuaternary,
      marginTop: 3,
    },
    streakDotsRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginTop: 12,
    },
    streakDot: {
      width: 8,
      height: 8,
      borderRadius: 999,
      borderWidth: 1.5,
      borderColor: C.cardBorder,
      backgroundColor: C.inputBg,
    },
    streakDotActive: {
      borderColor: C.accentBorder,
      backgroundColor: C.accentText,
    },
    streakBadge: { alignItems: "flex-end" },
    streakValueRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
    },
    streakText: { fontSize: 19, fontWeight: "800", color: C.accentText, lineHeight: 20 },
    streakLabel: { fontSize: 11, color: C.textTertiary, marginTop: 4 },
    expandBtn: {
      width: 36,
      height: 36,
      alignItems: "center",
      justifyContent: "center",
      marginLeft: 4,
      marginRight: -6,
    },
    focusHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
    },
    focusBadge: {
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
    focusBadgeText: {
      fontSize: 12,
      fontWeight: "600",
      color: C.accentText,
    },
    focusRule: {
      fontSize: 11,
      color: C.textQuaternary,
    },
    focusText: {
      fontSize: 13,
      color: C.textSecondary,
      lineHeight: 19,
      marginTop: 12,
    },
    focusTrackList: { gap: 10, marginTop: 16 },
    focusHabitCard: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      backgroundColor: C.inputBg,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: C.cardBorder,
      padding: 14,
      gap: 12,
    },
    focusHabitCardAvailable: {
      borderColor: C.accentBorder,
      backgroundColor: C.accentBgSubtle,
    },
    focusHabitCardLocked: { opacity: 0.6 },
    focusHabitLeft: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      flex: 1,
    },
    focusHabitIconWrap: {
      width: 38,
      height: 38,
      borderRadius: 12,
      backgroundColor: C.cardBorder,
      alignItems: "center",
      justifyContent: "center",
    },
    focusHabitIconWrapAvailable: { backgroundColor: C.accentBg },
    focusHabitInfo: { flex: 1 },
    focusHabitTitle: {
      fontSize: 14,
      fontWeight: "700",
      color: C.textPrimary,
    },
    focusHabitSubtitle: {
      fontSize: 12,
      color: C.textQuaternary,
      marginTop: 2,
    },
    focusHabitRight: { alignItems: "flex-end", minWidth: 62 },
    focusHabitMetric: {
      fontSize: 18,
      fontWeight: "800",
      color: C.accentText,
    },
    focusHabitStatus: {
      fontSize: 10,
      color: C.textTertiary,
      marginTop: 2,
    },
    focusHabitAvailable: {
      fontSize: 11,
      color: C.accentText,
      fontWeight: "700",
      marginTop: 2,
    },
    focusHabitLockedText: {
      fontSize: 10,
      color: C.textTertiary,
      marginTop: 4,
    },
    focusGroupsList: { gap: 10 },
    focusGroupCard: {
      backgroundColor: C.cardBg,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: C.cardBorder,
      padding: 14,
    },
    focusGroupHeaderContent: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      flex: 1,
    },
    focusGroupHeaderIconWrap: {
      width: 44,
      height: 44,
      borderRadius: 12,
      backgroundColor: C.cardBorder,
      alignItems: "center",
      justifyContent: "center",
    },
    focusGroupTitle: {
      fontSize: 14,
      fontWeight: "700",
      lineHeight: 20,
      color: C.textPrimary,
    },
    focusGroupContent: { marginLeft: 0 },
    focusGroupItems: { gap: 8 },
    focusGroupItem: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    focusGroupIcon: { width: 18, textAlign: "center" },
    focusGroupItemText: {
      flex: 1,
      fontSize: 13,
      color: C.textSecondary,
    },
  });
}
