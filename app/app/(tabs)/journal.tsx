import GradientBackground from "@/components/GradientBackground";
import { db, habitCompletions, habits } from "@/lib/db";
import { resolveIoniconName } from "@/lib/iconNames";
import { useTheme } from "@/hooks/useTheme";
import { Ionicons } from "@expo/vector-icons";
import { desc, isNotNull, or } from "drizzle-orm";
import { useLiveQuery } from "drizzle-orm/expo-sqlite";
import React, { useMemo } from "react";
import { Image, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

function parseDateKey(key: string): Date {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function formatSectionDate(key: string): string {
  return parseDateKey(key).toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}

export default function JournalScreen() {
  const insets = useSafeAreaInsets();
  const C = useTheme();

  const { data: allHabits } = useLiveQuery(db.select().from(habits));
  const { data: entries } = useLiveQuery(
    db
      .select()
      .from(habitCompletions)
      .where(
        or(
          isNotNull(habitCompletions.photoUri),
          isNotNull(habitCompletions.note),
        ),
      )
      .orderBy(desc(habitCompletions.date), desc(habitCompletions.createdAt)),
  );

  const habitById = useMemo(() => {
    const map = new Map<number, (typeof habits.$inferSelect)>();
    for (const habit of allHabits ?? []) map.set(habit.id, habit);
    return map;
  }, [allHabits]);

  const sections = useMemo(() => {
    const grouped = new Map<string, typeof entries>();
    for (const entry of entries ?? []) {
      const list = grouped.get(entry.date) ?? [];
      list.push(entry);
      grouped.set(entry.date, list);
    }
    return Array.from(grouped.entries());
  }, [entries]);

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
        <Text style={s.title}>Journal</Text>
        <Text style={s.subtitle}>
          Photos and reflections from your check-ins.
        </Text>

        {sections.length === 0 ? (
          <View style={s.emptyState}>
            <Ionicons name="book-outline" size={28} color={C.iconTertiary} />
            <Text style={s.emptyTitle}>No entries yet</Text>
            <Text style={s.emptyBody}>
              Add a photo or note when you check in on a habit to see it here.
            </Text>
          </View>
        ) : (
          <View style={s.timeline}>
            {sections.map(([date, dayEntries], sectionIndex) => {
              const isLastSection = sectionIndex === sections.length - 1;
              return (
                <View key={date} style={s.section}>
                  <Text style={s.sectionLabel}>
                    {formatSectionDate(date).toUpperCase()}
                  </Text>
                  {(dayEntries ?? []).map((entry, entryIndex) => {
                    const habit = habitById.get(entry.habitId);
                    const isLastEntry =
                      isLastSection && entryIndex === (dayEntries ?? []).length - 1;
                    return (
                      <View key={entry.id} style={s.timelineRow}>
                        <View style={s.timelineRail}>
                          <View style={s.timelineNode}>
                            <Ionicons
                              name={resolveIoniconName(
                                habit?.icon ?? null,
                                "star-outline",
                              )}
                              size={14}
                              color={C.accentText}
                            />
                          </View>
                          {!isLastEntry && <View style={s.timelineLine} />}
                        </View>
                        <View style={s.entryCard}>
                          <View style={s.entryHeader}>
                            <Text style={s.entryTitle} numberOfLines={1}>
                              {habit?.title ?? "Habit"}
                            </Text>
                          </View>
                          {entry.photoUri ? (
                            <Image
                              source={{ uri: entry.photoUri }}
                              style={s.entryPhoto}
                              resizeMode="cover"
                            />
                          ) : null}
                          {entry.note ? (
                            <Text style={s.entryNote}>{entry.note}</Text>
                          ) : null}
                        </View>
                      </View>
                    );
                  })}
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function makeStyles(C: ReturnType<typeof useTheme>) {
  return StyleSheet.create({
    container: { flex: 1 },
    content: { paddingHorizontal: 20 },
    title: {
      fontSize: 28,
      fontWeight: "700",
      color: C.textPrimary,
      marginBottom: 6,
    },
    subtitle: {
      fontSize: 14,
      color: C.textTertiary,
      marginBottom: 24,
    },
    timeline: {},
    section: { marginBottom: 8 },
    sectionLabel: {
      fontSize: 11,
      fontWeight: "700",
      letterSpacing: 1.5,
      color: C.textTertiary,
      marginBottom: 12,
      marginLeft: 2,
    },
    timelineRow: {
      flexDirection: "row",
      gap: 12,
    },
    timelineRail: {
      alignItems: "center",
      width: 28,
    },
    timelineNode: {
      width: 28,
      height: 28,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: C.accentBgSubtle,
      borderWidth: 1,
      borderColor: C.accentBorder,
    },
    timelineLine: {
      flex: 1,
      width: 2,
      minHeight: 12,
      marginVertical: 4,
      backgroundColor: C.cardBorder,
    },
    entryCard: {
      flex: 1,
      backgroundColor: C.cardBg,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: C.cardBorder,
      padding: 14,
      gap: 10,
      marginBottom: 16,
    },
    entryHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    entryTitle: {
      flex: 1,
      fontSize: 14,
      fontWeight: "700",
      color: C.textPrimary,
    },
    entryPhoto: {
      width: "100%",
      height: 220,
      borderRadius: 12,
    },
    entryNote: {
      fontSize: 14,
      lineHeight: 20,
      color: C.textSecondary,
    },
    emptyState: {
      alignItems: "center",
      paddingVertical: 60,
      paddingHorizontal: 24,
      gap: 10,
    },
    emptyTitle: {
      fontSize: 16,
      fontWeight: "700",
      color: C.textPrimary,
    },
    emptyBody: {
      fontSize: 13,
      color: C.textTertiary,
      textAlign: "center",
      lineHeight: 19,
    },
  });
}
