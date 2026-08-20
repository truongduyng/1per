import GradientBackground from "@/components/GradientBackground";
import { HabitHeatmap } from "@/components/HabitHeatmap";
import { useTheme } from "@/hooks/useTheme";
import {
  db,
  habits,
  habitCompletions,
  dailyFocus,
  challenges,
  habitOps,
  challengeOps,
} from "@/lib/db";
import { getTodayInLocalTimezone, getLocalDateString } from "@/lib/timezone";
import { isNull } from "drizzle-orm";
import { useLiveQuery } from "drizzle-orm/expo-sqlite";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useMemo, useState } from "react";
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { DAY_NAMES } from "@/lib/performance";
import { resolveIoniconName, type IoniconName } from "@/lib/iconNames";

const ALL_DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
const DAY_LABELS: Record<string, string> = {
  mon: "M", tue: "T", wed: "W", thu: "T", fri: "F", sat: "S", sun: "S",
};

const ICON_OPTIONS: IoniconName[] = [
  "star-outline", "flame-outline", "flash-outline", "leaf-outline", "heart-outline", "walk-outline",
  "water-outline", "bed-outline", "body-outline", "journal-outline", "book-outline", "pencil-outline",
  "barbell-outline", "bicycle-outline", "nutrition-outline", "bulb-outline", "timer-outline", "stats-chart-outline",
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
      <View style={ms.sheet}>
        <View style={ms.handle} />
        <View style={ms.header}>
          <Pressable
            onPress={handleClose}
            style={ms.iconBtn}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Cancel"
          >
            <Ionicons name="close" size={20} color={C.textSecondary} />
          </Pressable>
          <Text style={ms.headerTitle} numberOfLines={1}>
            New Habit
          </Text>
          <Pressable
            onPress={handleSave}
            style={[ms.iconBtn, ms.saveIconBtn, (!title.trim() || saving) && ms.saveIconBtnDisabled]}
            disabled={!title.trim() || saving}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Save habit"
          >
            <Ionicons
              name="checkmark"
              size={20}
              color={(!title.trim() || saving) ? C.textQuaternary : C.accentText}
            />
          </Pressable>
        </View>

        <KeyboardAwareScrollView
          style={ms.scroll}
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
          bottomOffset={32}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
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

          <View style={[ms.section, ms.iconSection]}>
            <Text style={ms.label}>ICON</Text>
            <View style={ms.iconGrid}>
              {ICON_OPTIONS.map((icon) => (
                <Pressable
                  key={icon}
                  style={[ms.iconCell, selectedIcon === icon && ms.iconCellSelected]}
                  onPress={() => setSelectedIcon(icon)}
                  accessibilityRole="button"
                  accessibilityLabel={`Choose ${icon.replace("-outline", "")}`}
                  accessibilityState={{ selected: selectedIcon === icon }}
                >
                  <View style={ms.iconGlyph}>
                    <Ionicons
                      name={icon}
                      size={22}
                      color={selectedIcon === icon ? C.accentText : C.iconSecondary}
                      style={ms.iconGlyphIcon}
                    />
                  </View>
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
        </KeyboardAwareScrollView>
      </View>
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
      flex: 1,
      textAlign: "center",
      fontSize: 16,
      fontWeight: "700",
      color: C.textPrimary,
    },
    headerBtn: { minWidth: 60 },
    iconBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      borderCurve: "continuous",
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: C.cardBg,
      borderWidth: 1,
      borderColor: C.cardBorder,
    },
    saveIconBtn: {
      backgroundColor: C.accentBg,
      borderColor: C.accentBorder,
    },
    saveIconBtnDisabled: { opacity: 0.5 },
    scroll: { flex: 1 },
    section: { marginBottom: 24 },
    iconSection: { marginBottom: -12 },
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
      borderCurve: "continuous",
      borderWidth: 1,
      borderColor: C.cardBorder,
      paddingHorizontal: 14,
      paddingVertical: 13,
      fontSize: 15,
      color: C.textPrimary,
      textAlignVertical: "center",
    },
    iconGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent: "space-between",
      rowGap: 10,
    },
    iconCell: {
      width: "14.5%",
      aspectRatio: 1,
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
    iconGlyph: {
      width: 24,
      height: 24,
      alignItems: "center",
      justifyContent: "center",
    },
    iconGlyphIcon: {
      width: 22,
      height: 22,
      lineHeight: 22,
      textAlign: "center",
      includeFontPadding: false,
      transform: [{ translateY: -6 }],
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


function parseDateKey(key: string): Date {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}

type ChallengeRow = typeof challenges.$inferSelect;
type HabitRow = typeof habits.$inferSelect;

function ChallengeDetailModal({
  challenge,
  habits: challengeHabits,
  doneIds,
  streakMap,
  today,
  onClose,
  onQuit,
}: {
  challenge: ChallengeRow | null;
  habits: HabitRow[];
  doneIds: Set<number>;
  streakMap: Record<number, number>;
  today: Date;
  onClose: () => void;
  onQuit: (id: number, title: string) => void;
}) {
  const C = useTheme();
  const insets = useSafeAreaInsets();
  const ms = makeModalStyles(C);
  const ds = makeDetailStyles(C);

  if (!challenge) return null;

  const startDateObj = parseDateKey(challenge.startDate);
  const daysElapsed = Math.round((today.getTime() - startDateObj.getTime()) / 86400000);
  const dayNumber = Math.min(daysElapsed + 1, challenge.durationDays);
  const isComplete = daysElapsed >= challenge.durationDays;
  const daysLeft = Math.max(challenge.durationDays - dayNumber, 0);
  const progress = Math.max(0, Math.min(dayNumber / challenge.durationDays, 1));
  const doneToday = challengeHabits.filter((h) => doneIds.has(h.id)).length;

  return (
    <Modal
      visible
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={[ms.sheet, { paddingBottom: insets.bottom + 24 }]}>
        <View style={ms.handle} />
        <View style={ms.header}>
          <Pressable
            onPress={onClose}
            style={ms.headerBtn}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Close"
          >
            <Ionicons name="close" size={24} color={C.textSecondary} />
          </Pressable>
          <Text style={ms.headerTitle}>Challenge</Text>
          <View style={ms.headerBtn} />
        </View>

        <ScrollView style={ms.scroll} showsVerticalScrollIndicator={false}>
          <View style={ds.hero}>
            <View style={ds.heroIconWrap}>
              <Ionicons
                name={resolveIoniconName(challenge.icon, "flame-outline")}
                size={26}
                color={C.accentText}
              />
            </View>
            <Text style={ds.heroTitle}>{challenge.title}</Text>
            {challenge.subtitle ? (
              <Text style={ds.heroSubtitle}>{challenge.subtitle}</Text>
            ) : null}
          </View>

          <View style={ds.progressBlock}>
            <View style={ds.progressLabelRow}>
              <Text style={ds.progressLabel}>
                {isComplete ? "Complete" : `Day ${dayNumber} of ${challenge.durationDays}`}
              </Text>
              <Text style={ds.progressPct}>{Math.round(progress * 100)}%</Text>
            </View>
            <View style={ds.progressTrack}>
              <View style={[ds.progressFill, { width: `${progress * 100}%` }]} />
            </View>
          </View>

          <View style={ds.statsRow}>
            <View style={ds.statCell}>
              <Text style={ds.statValue}>{dayNumber}</Text>
              <Text style={ds.statLabel}>Current day</Text>
            </View>
            <View style={ds.statCell}>
              <Text style={ds.statValue}>{daysLeft}</Text>
              <Text style={ds.statLabel}>Days left</Text>
            </View>
            <View style={ds.statCell}>
              <Text style={ds.statValue}>
                {doneToday}/{challengeHabits.length}
              </Text>
              <Text style={ds.statLabel}>Done today</Text>
            </View>
          </View>

          <Text style={[ms.label, ds.rulesLabel]}>DAILY RULES</Text>
          <View style={ds.rulesList}>
            {challengeHabits.map((habit) => {
              const isDone = doneIds.has(habit.id);
              const streak = streakMap[habit.id] ?? 0;
              return (
                <View key={habit.id} style={ds.ruleRow}>
                  <Ionicons
                    name={isDone ? "checkmark-circle" : "ellipse-outline"}
                    size={20}
                    color={isDone ? C.accentText : C.textQuaternary}
                  />
                  <View style={ds.ruleInfo}>
                    <Text style={ds.ruleTitle} numberOfLines={1}>
                      {habit.title}
                    </Text>
                    {habit.subtitle ? (
                      <Text style={ds.ruleSubtitle} numberOfLines={1}>
                        {habit.subtitle}
                      </Text>
                    ) : null}
                  </View>
                  <View style={ds.ruleStreak}>
                    <Ionicons name="flame" size={13} color={C.accentText} />
                    <Text style={ds.ruleStreakText}>{streak}</Text>
                  </View>
                </View>
              );
            })}
          </View>

          <Pressable
            style={ds.quitBtn}
            onPress={() => onQuit(challenge.id, challenge.title)}
            accessibilityRole="button"
            accessibilityLabel="Quit challenge"
          >
            <Ionicons name="exit-outline" size={18} color={C.textQuaternary} />
            <Text style={ds.quitBtnText}>Quit Challenge</Text>
          </Pressable>
        </ScrollView>
      </View>
    </Modal>
  );
}

function makeDetailStyles(C: ReturnType<typeof import("@/hooks/useTheme").useTheme>) {
  return StyleSheet.create({
    hero: { alignItems: "center", marginBottom: 24 },
    heroIconWrap: {
      width: 56,
      height: 56,
      borderRadius: 16,
      backgroundColor: C.accentBg,
      borderWidth: 1,
      borderColor: C.accentBorder,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 12,
    },
    heroTitle: { fontSize: 20, fontWeight: "700", color: C.textPrimary },
    heroSubtitle: {
      fontSize: 13,
      lineHeight: 19,
      color: C.textSecondary,
      textAlign: "center",
      marginTop: 6,
    },
    progressBlock: { marginBottom: 20 },
    progressLabelRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 8,
    },
    progressLabel: { fontSize: 13, fontWeight: "600", color: C.textSecondary },
    progressPct: { fontSize: 13, fontWeight: "700", color: C.accentText },
    progressTrack: {
      height: 8,
      borderRadius: 999,
      backgroundColor: C.inputBg,
      overflow: "hidden",
    },
    progressFill: { height: "100%", borderRadius: 999, backgroundColor: C.accent },
    statsRow: { flexDirection: "row", gap: 10, marginBottom: 28 },
    statCell: {
      flex: 1,
      alignItems: "center",
      backgroundColor: C.cardBg,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: C.cardBorder,
      paddingVertical: 14,
    },
    statValue: { fontSize: 18, fontWeight: "700", color: C.textPrimary },
    statLabel: { fontSize: 11, color: C.textTertiary, marginTop: 4 },
    rulesLabel: { marginBottom: 10 },
    rulesList: { gap: 10, marginBottom: 28 },
    ruleRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      backgroundColor: C.cardBg,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: C.cardBorder,
      paddingHorizontal: 14,
      paddingVertical: 14,
    },
    ruleInfo: { flex: 1 },
    ruleTitle: { fontSize: 15, fontWeight: "600", color: C.textPrimary },
    ruleSubtitle: { fontSize: 12, color: C.textQuaternary, marginTop: 3 },
    ruleStreak: { flexDirection: "row", alignItems: "center", gap: 4 },
    ruleStreakText: { fontSize: 13, fontWeight: "700", color: C.textSecondary },
    quitBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      backgroundColor: C.inputBg,
      borderWidth: 1,
      borderColor: C.cardBorder,
      borderRadius: 14,
      paddingVertical: 14,
    },
    quitBtnText: { fontSize: 14, fontWeight: "700", color: C.textQuaternary },
  });
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
  const [detailChallengeId, setDetailChallengeId] = useState<number | null>(null);

  const { data: allHabits } = useLiveQuery(
    db.select().from(habits).where(isNull(habits.archivedAt)),
  );
  const { data: allCompletions } = useLiveQuery(db.select().from(habitCompletions));
  const { data: allFocusRows } = useLiveQuery(db.select().from(dailyFocus));
  const { data: activeChallenges } = useLiveQuery(
    db.select().from(challenges).where(isNull(challenges.archivedAt)),
  );

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

  const detailChallenge = useMemo(
    () => (activeChallenges ?? []).find((c) => c.id === detailChallengeId) ?? null,
    [activeChallenges, detailChallengeId],
  );
  const detailChallengeHabits = useMemo(
    () =>
      detailChallengeId == null
        ? []
        : (allHabits ?? []).filter((h) => h.challengeId === detailChallengeId),
    [allHabits, detailChallengeId],
  );

  const removeHabit = (id: number, title: string, challengeId: number | null) => {
    if (challengeId != null) {
      Alert.alert(
        `"${title}" belongs to a challenge`,
        "Quit the challenge to remove its habits.",
        [{ text: "OK" }],
      );
      return;
    }
    Alert.alert(
      `Remove "${title}"?`,
      "It disappears from your daily list. Past check-ins are kept in your stats.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            await habitOps.delete(id);
            setExpandedHabitId(null);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          },
        },
      ],
    );
  };

  const endChallenge = (id: number, title: string) => {
    const habitCount = (allHabits ?? []).filter((h) => h.challengeId === id).length;
    Alert.alert(
      `Quit "${title}"?`,
      `Its ${habitCount} habit${habitCount === 1 ? "" : "s"} will be removed from your daily list. Past check-ins are kept in your stats.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Quit Challenge",
          style: "destructive",
          onPress: async () => {
            await challengeOps.end(id);
            setDetailChallengeId(null);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          },
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
                    <Pressable
                      style={s.habitCardRow}
                      onPress={() => setDetailChallengeId(challenge.id)}
                      accessibilityRole="button"
                      accessibilityLabel={`${challenge.title} details`}
                    >
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
                        accessibilityLabel="Quit challenge"
                      >
                        <Ionicons name="close-circle-outline" size={20} color={C.textQuaternary} />
                      </Pressable>
                    </Pressable>
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
              <Text style={s.emptyChallengeText}>Try a preset challenge like 69 Hard</Text>
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
                      onPress={() => setExpandedHabitId(isExpanded ? null : habit.id)}
                      accessibilityRole="button"
                      accessibilityLabel={isExpanded ? `Hide ${habit.title} details` : `Show ${habit.title} details`}
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
                      {/* Read-only: tapping the streak must never check the habit in. */}
                      <View
                        style={s.streakBadge}
                        onStartShouldSetResponder={() => true}
                        accessible
                        accessibilityRole="text"
                        accessibilityLabel={`${streak} day streak`}
                      >
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
                      <>
                        <HabitHeatmap
                          habitId={habit.id}
                          daysOfWeek={habit.daysOfWeek as string[]}
                          completions={allCompletions ?? []}
                          today={today}
                          createdAt={habit.createdAt}
                          bestStreak={bestStreakMap[habit.id] ?? 0}
                          totalDone={totalDoneMap[habit.id] ?? 0}
                        />
                        <Pressable
                          style={s.removeHabitBtn}
                          onPress={() => removeHabit(habit.id, habit.title, habit.challengeId)}
                          accessibilityRole="button"
                          accessibilityLabel={`Remove ${habit.title}`}
                        >
                          <Ionicons name="trash-outline" size={20} color={C.textQuaternary} />
                          <Text style={s.removeHabitBtnText}>Remove</Text>
                        </Pressable>
                      </>
                    )}
                  </View>
                );
              })}
            </View>
          )}
        </View>
      </ScrollView>

      <AddCustomHabitModal
        visible={addModalVisible}
        onClose={() => setAddModalVisible(false)}
        onSave={addCustomHabit}
      />

      <ChallengeDetailModal
        challenge={detailChallenge}
        habits={detailChallengeHabits}
        doneIds={doneIds}
        streakMap={streakMap}
        today={today}
        onClose={() => setDetailChallengeId(null)}
        onQuit={endChallenge}
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
    removeHabitBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      paddingVertical: 10,
      marginTop: 12,
    },
    removeHabitBtnText: {
      fontSize: 13,
      fontWeight: "600",
      color: C.textQuaternary,
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
