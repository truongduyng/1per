import { HabitCheckInModal, type HabitCheckInDraft } from "@/components/HabitCheckInModal";
import { completionOps, habitCompletions, habits } from "@/lib/db";
import { deleteHabitPhoto } from "@/lib/habitPhotos";
import { useTheme } from "@/hooks/useTheme";
import { resolveIoniconName } from "@/lib/iconNames";
import * as Haptics from "expo-haptics";
import Ionicons from "@expo/vector-icons/Ionicons";
import React, { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

type HabitRow = typeof habits.$inferSelect;
type CompletionRow = typeof habitCompletions.$inferSelect;

interface Props {
  todayHabits: HabitRow[];
  allCompletions: CompletionRow[];
  doneIds: Set<number>;
  today: Date;
  todayKey: string;
}

export function HomeHabitsSection({
  todayHabits,
  allCompletions,
  doneIds,
  today,
  todayKey,
}: Props) {
  const C = useTheme();
  const [checkInHabitId, setCheckInHabitId] = useState<number | null>(null);

  const todayCheckIns = useMemo(() => {
    const map: Record<number, { photoUri: string | null; note: string | null }> = {};
    for (const completion of allCompletions) {
      if (completion.date === todayKey) {
        map[completion.habitId] = {
          photoUri: completion.photoUri ?? null,
          note: completion.note ?? null,
        };
      }
    }
    return map;
  }, [allCompletions, todayKey]);

  const checkInHabit = useMemo(
    () => todayHabits.find((habit) => habit.id === checkInHabitId) ?? null,
    [todayHabits, checkInHabitId],
  );

  const submitCheckIn = async (habitId: number, draft: HabitCheckInDraft) => {
    const wasDone = doneIds.has(habitId);
    await completionOps.markDone(habitId, today, {
      photoUri: draft.photoUri,
      note: draft.note,
    });
    if (!wasDone) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  };

  const undoCheckIn = async (habitId: number) => {
    deleteHabitPhoto(todayCheckIns[habitId]?.photoUri);
    await completionOps.markUndone(habitId, today);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleHabitPress = (habitId: number, isDone: boolean) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (isDone) {
      void undoCheckIn(habitId);
      return;
    }
    setCheckInHabitId(habitId);
  };

  const s = makeStyles(C);

  return (
    <>
      <View style={s.section}>
        <Text style={s.sectionLabel}>HABITS</Text>
        <View style={s.card}>
          {todayHabits.length === 0 ? (
            <View style={s.emptyRow}>
              <Text style={s.emptyText}>No habits scheduled for today</Text>
            </View>
          ) : (
            todayHabits.map((habit, index) => {
              const done = doneIds.has(habit.id);
              const checkIn = todayCheckIns[habit.id];
              return (
                <View key={habit.id}>
                  {index > 0 && <View style={s.divider} />}
                  <Pressable
                    style={s.row}
                    onPress={() => handleHabitPress(habit.id, done)}
                    accessibilityRole="button"
                    accessibilityLabel={
                      done
                        ? `${habit.title}, done today. Undo check-in`
                        : `Check in ${habit.title}`
                    }
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
                      {habit.subtitle ? (
                        <Text style={s.rowSubtitle}>{habit.subtitle}</Text>
                      ) : null}
                    </View>
                    {checkIn?.photoUri ? (
                      <Ionicons
                        name="image-outline"
                        size={16}
                        color={C.textQuaternary}
                        style={s.checkInBadge}
                      />
                    ) : null}
                    <View style={[s.checkbox, done && s.checkboxDone]}>
                      {done && <Ionicons name="checkmark" size={13} color={C.textInverse} />}
                    </View>
                  </Pressable>
                </View>
              );
            })
          )}
        </View>
      </View>

      {checkInHabit ? (
        <HabitCheckInModal
          key={`check-in-${checkInHabit.id}-${todayKey}`}
          visible={checkInHabitId != null}
          habitId={checkInHabit.id}
          habitTitle={checkInHabit.title}
          dateKey={todayKey}
          isDone={doneIds.has(checkInHabit.id)}
          initialPhotoUri={todayCheckIns[checkInHabit.id]?.photoUri ?? null}
          initialNote={todayCheckIns[checkInHabit.id]?.note ?? null}
          onClose={() => setCheckInHabitId(null)}
          onSubmit={(draft) => submitCheckIn(checkInHabit.id, draft)}
          onUndo={() => undoCheckIn(checkInHabit.id)}
        />
      ) : null}
    </>
  );
}

function makeStyles(C: ReturnType<typeof useTheme>) {
  return StyleSheet.create({
    section: { marginBottom: 24 },
    sectionLabel: {
      fontSize: 11,
      fontWeight: "700",
      letterSpacing: 1.5,
      color: C.textTertiary,
      marginBottom: 10,
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
    checkInBadge: { marginRight: 10 },
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
      backgroundColor: C.accent,
      borderColor: C.accent,
    },
    emptyRow: { paddingVertical: 20, paddingHorizontal: 16 },
    emptyText: { fontSize: 14, color: C.textQuaternary, textAlign: "center" },
  });
}
