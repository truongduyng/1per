import { AddJournalEntryModal } from "@/components/AddJournalEntryModal";
import GradientBackground from "@/components/GradientBackground";
import { dailyFocus, db, habitCompletions, habits, journalEntries, journalEntryOps } from "@/lib/db";
import { deleteBackedUpJournalPhoto } from "@/lib/cloudSync";
import { resolveIoniconName } from "@/lib/iconNames";
import { useTheme } from "@/hooks/useTheme";
import { Ionicons } from "@expo/vector-icons";
import { desc, isNotNull, or } from "drizzle-orm";
import { useLiveQuery } from "drizzle-orm/expo-sqlite";
import React, { useMemo, useState } from "react";
import { Alert, Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { VideoView, useVideoPlayer } from "expo-video";

type TimelineItem =
  | { kind: "habit"; id: string; createdAt: number; entry: typeof habitCompletions.$inferSelect }
  | { kind: "focus"; id: string; createdAt: number; entry: typeof dailyFocus.$inferSelect }
  | { kind: "journal"; id: string; createdAt: number; entry: typeof journalEntries.$inferSelect };

function FocusVideoPlayerModal({
  uri,
  onClose,
}: {
  uri: string | null;
  onClose: () => void;
}) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = false;
    p.play();
  });

  return (
    <Modal
      visible={!!uri}
      animationType="fade"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <View style={playerStyles.container}>
        {uri ? (
          <VideoView
            style={playerStyles.video}
            player={player}
            nativeControls
            contentFit="contain"
          />
        ) : null}
        <Pressable
          style={playerStyles.closeBtn}
          onPress={onClose}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Close video"
        >
          <Ionicons name="close" size={22} color="#fff" />
        </Pressable>
      </View>
    </Modal>
  );
}

const playerStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000", justifyContent: "center" },
  video: { flex: 1 },
  closeBtn: {
    position: "absolute",
    top: 56,
    right: 20,
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.5)",
  },
});

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
  const { data: focusVideos } = useLiveQuery(
    db
      .select()
      .from(dailyFocus)
      .where(isNotNull(dailyFocus.videoUri))
      .orderBy(desc(dailyFocus.date)),
  );
  const { data: freestyleEntries } = useLiveQuery(
    db.select().from(journalEntries).orderBy(desc(journalEntries.createdAt)),
  );

  const [addModalVisible, setAddModalVisible] = useState(false);
  const [playingVideoUri, setPlayingVideoUri] = useState<string | null>(null);

  const habitById = useMemo(() => {
    const map = new Map<number, (typeof habits.$inferSelect)>();
    for (const habit of allHabits ?? []) map.set(habit.id, habit);
    return map;
  }, [allHabits]);

  const sections = useMemo(() => {
    const grouped = new Map<string, TimelineItem[]>();
    for (const entry of entries ?? []) {
      const list = grouped.get(entry.date) ?? [];
      list.push({
        kind: "habit",
        id: `habit-${entry.id}`,
        createdAt: entry.createdAt?.getTime() ?? 0,
        entry,
      });
      grouped.set(entry.date, list);
    }
    for (const entry of focusVideos ?? []) {
      const list = grouped.get(entry.date) ?? [];
      list.push({
        kind: "focus",
        id: `focus-${entry.id}`,
        createdAt: entry.updatedAt?.getTime() ?? 0,
        entry,
      });
      grouped.set(entry.date, list);
    }
    for (const entry of freestyleEntries ?? []) {
      const list = grouped.get(entry.date) ?? [];
      list.push({
        kind: "journal",
        id: `journal-${entry.id}`,
        createdAt: entry.createdAt?.getTime() ?? 0,
        entry,
      });
      grouped.set(entry.date, list);
    }
    const dated = Array.from(grouped.entries()).sort(([a], [b]) => (a < b ? 1 : -1));
    for (const [, items] of dated) items.sort((a, b) => b.createdAt - a.createdAt);
    return dated;
  }, [entries, focusVideos, freestyleEntries]);

  const confirmDeleteJournalEntry = (id: number) => {
    Alert.alert("Delete entry?", "This journal entry will be permanently removed.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          deleteBackedUpJournalPhoto(id);
          void journalEntryOps.delete(id);
        },
      },
    ]);
  };

  const handleSaveEntry = async (draft: { note: string; photoUri: string | null }) => {
    await journalEntryOps.create({ note: draft.note, photoUri: draft.photoUri });
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
        <Text style={s.title}>Journal</Text>
        <Text style={s.subtitle}>
          Photos, reflections, and focus videos from your days.
        </Text>

        {sections.length === 0 ? (
          <View style={s.emptyState}>
            <Ionicons name="book-outline" size={28} color={C.iconTertiary} />
            <Text style={s.emptyTitle}>No entries yet</Text>
            <Text style={s.emptyBody}>
              Add a photo or note at check-in, finish a focus session, or tap
              the + button to write a freestyle entry.
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
                  {dayEntries.map((item, entryIndex) => {
                    const isLastEntry =
                      isLastSection && entryIndex === dayEntries.length - 1;

                    if (item.kind === "focus") {
                      const { entry } = item;
                      return (
                        <View key={item.id} style={s.timelineRow}>
                          <View style={s.timelineRail}>
                            <View style={s.timelineNode}>
                              <Ionicons
                                name="videocam"
                                size={14}
                                color={C.accentText}
                              />
                            </View>
                            {!isLastEntry && <View style={s.timelineLine} />}
                          </View>
                          <View style={s.entryCard}>
                            <View style={s.entryHeader}>
                              <Text style={s.entryTitle} numberOfLines={1}>
                                Focus session
                              </Text>
                              {entry.focusMinutes > 0 ? (
                                <Text style={s.entryMeta}>
                                  {entry.focusMinutes} min
                                </Text>
                              ) : null}
                            </View>
                            {entry.goal ? (
                              <Text style={s.entryNote}>{entry.goal}</Text>
                            ) : null}
                            <Pressable
                              style={s.videoThumb}
                              onPress={() => setPlayingVideoUri(entry.videoUri!)}
                              accessibilityRole="button"
                              accessibilityLabel="Play focus session video"
                            >
                              <View style={s.videoPlayButton}>
                                <Ionicons name="play" size={22} color={C.textPrimary} />
                              </View>
                            </Pressable>
                          </View>
                        </View>
                      );
                    }

                    if (item.kind === "journal") {
                      const { entry } = item;
                      return (
                        <View key={item.id} style={s.timelineRow}>
                          <View style={s.timelineRail}>
                            <View style={s.timelineNode}>
                              <Ionicons
                                name="create-outline"
                                size={14}
                                color={C.accentText}
                              />
                            </View>
                            {!isLastEntry && <View style={s.timelineLine} />}
                          </View>
                          <Pressable
                            style={s.entryCard}
                            onLongPress={() => confirmDeleteJournalEntry(entry.id)}
                            accessibilityRole="button"
                            accessibilityLabel="Journal entry, long press to delete"
                          >
                            <View style={s.entryHeader}>
                              <Text style={s.entryTitle} numberOfLines={1}>
                                Journal
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
                          </Pressable>
                        </View>
                      );
                    }

                    const { entry } = item;
                    const habit = habitById.get(entry.habitId);
                    return (
                      <View key={item.id} style={s.timelineRow}>
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

      <Pressable
        style={[s.fab, { bottom: insets.bottom + 24 }]}
        onPress={() => setAddModalVisible(true)}
        accessibilityRole="button"
        accessibilityLabel="Add journal entry"
      >
        <Ionicons name="add" size={28} color={C.textInverse} />
      </Pressable>

      <AddJournalEntryModal
        visible={addModalVisible}
        onClose={() => setAddModalVisible(false)}
        onSave={handleSaveEntry}
      />

      <FocusVideoPlayerModal
        uri={playingVideoUri}
        onClose={() => setPlayingVideoUri(null)}
      />
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
    entryMeta: {
      fontSize: 12,
      fontWeight: "600",
      color: C.textTertiary,
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
    videoThumb: {
      width: "100%",
      height: 220,
      borderRadius: 12,
      backgroundColor: C.inputBg,
      alignItems: "center",
      justifyContent: "center",
    },
    videoPlayButton: {
      width: 52,
      height: 52,
      borderRadius: 26,
      backgroundColor: "rgba(0,0,0,0.35)",
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.24)",
      alignItems: "center",
      justifyContent: "center",
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
    fab: {
      position: "absolute",
      right: 20,
      width: 56,
      height: 56,
      borderRadius: 28,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: C.accent,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.25,
      shadowRadius: 8,
      elevation: 6,
    },
  });
}
