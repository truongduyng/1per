import GradientBackground from "@/components/GradientBackground";
import { Composer } from "@/components/journal/Composer";
import { MediaViewer, type ViewerMedia } from "@/components/journal/MediaViewer";
import { MessageBubble } from "@/components/journal/MessageBubble";
import { ReminderSheet } from "@/components/journal/ReminderSheet";
import { useNow } from "@/hooks/useNow";
import { useTheme } from "@/hooks/useTheme";
import { dailyFocus, db, habitCompletions, habits, journalEntries } from "@/lib/db";
import { resolveIoniconName } from "@/lib/iconNames";
import {
  ensureReminderPermission,
  journalEntryHaystack,
  journalEntryMatchesFilter,
  matchesQuery,
  parseJournalEntry,
  reconcileJournalReminders,
  type JournalFilter,
  type ParsedJournalEntry,
} from "@/lib/journal";
import {
  deleteJournalMessage,
  linkJournalHabit,
  setJournalReminder,
  toggleChecklistItem,
  unlinkJournalHabit,
} from "@/lib/journalActions";
import { Ionicons } from "@expo/vector-icons";
import { desc, isNotNull, or } from "drizzle-orm";
import { useLiveQuery } from "drizzle-orm/expo-sqlite";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActionSheetIOS,
  Alert,
  FlatList,
  Image,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { KeyboardStickyView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type HabitRow = typeof habitCompletions.$inferSelect;
type FocusRow = typeof dailyFocus.$inferSelect;

type Row =
  | { kind: "day"; key: string; date: string }
  | { kind: "message"; key: string; createdAt: number; date: string; entry: ParsedJournalEntry }
  | { kind: "habit"; key: string; createdAt: number; date: string; entry: HabitRow }
  | { kind: "focus"; key: string; createdAt: number; date: string; entry: FocusRow };

const FILTERS: { id: JournalFilter; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { id: "all", label: "All", icon: "albums-outline" },
  { id: "photos", label: "Photos", icon: "image-outline" },
  { id: "videos", label: "Videos", icon: "videocam-outline" },
  { id: "files", label: "Files", icon: "document-outline" },
  { id: "links", label: "Links", icon: "link-outline" },
  { id: "checklists", label: "Checklists", icon: "checkbox-outline" },
  { id: "reminders", label: "Reminders", icon: "alarm-outline" },
];

function parseDateKey(key: string): Date {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function formatDay(key: string): string {
  const date = parseDateKey(key);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return "Today";
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
    ...(date.getFullYear() !== today.getFullYear() ? { year: "numeric" } : {}),
  });
}

export default function JournalScreen() {
  const insets = useSafeAreaInsets();
  const C = useTheme();
  const s = makeStyles(C);
  const listRef = useRef<FlatList<Row>>(null);
  const params = useLocalSearchParams<{ entry?: string }>();
  const now = useNow();

  const { data: allHabits } = useLiveQuery(db.select().from(habits));
  const { data: habitEntries } = useLiveQuery(
    db
      .select()
      .from(habitCompletions)
      .where(or(isNotNull(habitCompletions.photoUri), isNotNull(habitCompletions.note)))
      .orderBy(desc(habitCompletions.date), desc(habitCompletions.createdAt)),
  );
  const { data: focusVideos } = useLiveQuery(
    db.select().from(dailyFocus).where(isNotNull(dailyFocus.videoUri)).orderBy(desc(dailyFocus.date)),
  );
  const { data: journalRows } = useLiveQuery(
    db.select().from(journalEntries).orderBy(desc(journalEntries.createdAt)),
  );

  const messages = useMemo(() => (journalRows ?? []).map(parseJournalEntry), [journalRows]);

  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<JournalFilter>("all");
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [habitFilter, setHabitFilter] = useState<number | null>(null);
  const [editing, setEditing] = useState<ParsedJournalEntry | null>(null);
  const [reminderFor, setReminderFor] = useState<ParsedJournalEntry | null>(null);
  const [viewer, setViewer] = useState<ViewerMedia>(null);
  const [highlightId, setHighlightId] = useState<number | null>(null);

  // Restore reminders lost to a reinstall/restore and drop orphaned ones.
  const reconciled = useRef(false);
  useEffect(() => {
    if (reconciled.current || !journalRows) return;
    reconciled.current = true;
    void reconcileJournalReminders(messages);
  }, [journalRows, messages]);

  const habitById = useMemo(() => {
    const map = new Map<number, typeof habits.$inferSelect>();
    for (const habit of allHabits ?? []) map.set(habit.id, habit);
    return map;
  }, [allHabits]);

  const tagCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const m of messages) for (const t of m.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [messages]);
  const knownTags = useMemo(() => tagCounts.map(([t]) => t), [tagCounts]);

  // Active habits for the composer's "Log habit" picker.
  const activeHabits = useMemo(
    () =>
      (allHabits ?? [])
        .filter((h) => !h.archivedAt)
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((h) => ({ id: h.id, title: h.title, icon: h.icon })),
    [allHabits],
  );

  // Habits that have something in the journal (linked messages or check-in notes/photos).
  const habitCounts = useMemo(() => {
    const counts = new Map<number, number>();
    for (const m of messages) if (m.habitId) counts.set(m.habitId, (counts.get(m.habitId) ?? 0) + 1);
    for (const c of habitEntries ?? []) counts.set(c.habitId, (counts.get(c.habitId) ?? 0) + 1);
    return [...counts.entries()]
      .filter(([id]) => habitById.has(id))
      .sort((a, b) => b[1] - a[1]);
  }, [messages, habitEntries, habitById]);

  const upcomingCount = useMemo(
    () => messages.filter((m) => m.remindAt && m.remindAt.getTime() > now).length,
    [messages, now],
  );

  const isFiltering = query.trim().length > 0 || filter !== "all" || !!tagFilter || !!habitFilter;

  const rows = useMemo(() => {
    const q = query.trim();
    const items: Exclude<Row, { kind: "day" }>[] = [];

    for (const entry of messages) {
      if (tagFilter && !entry.tags.includes(tagFilter)) continue;
      if (habitFilter && entry.habitId !== habitFilter) continue;
      if (!journalEntryMatchesFilter(entry, filter)) continue;
      if (q && !matchesQuery(journalEntryHaystack(entry), entry.tags, q)) continue;
      items.push({
        kind: "message",
        key: `m-${entry.id}`,
        createdAt: entry.createdAt.getTime(),
        date: entry.date,
        entry,
      });
    }

    // Habit check-ins and focus videos only appear when no message-specific filter is active.
    const allowHabits = !tagFilter && (filter === "all" || filter === "photos");
    const allowFocus = !tagFilter && !habitFilter && (filter === "all" || filter === "videos");
    if (allowHabits) {
      for (const entry of habitEntries ?? []) {
        if (filter === "photos" && !entry.photoUri) continue;
        if (habitFilter && entry.habitId !== habitFilter) continue;
        const habit = habitById.get(entry.habitId);
        const hay = `${habit?.title ?? ""}\n${entry.note ?? ""}`.toLowerCase();
        if (q && !matchesQuery(hay, [], q)) continue;
        items.push({
          kind: "habit",
          key: `h-${entry.id}`,
          createdAt: entry.createdAt?.getTime() ?? 0,
          date: entry.date,
          entry,
        });
      }
    }
    if (allowFocus) {
      for (const entry of focusVideos ?? []) {
        if (q && !matchesQuery(`focus session\n${entry.goal}`.toLowerCase(), [], q)) continue;
        items.push({
          kind: "focus",
          key: `f-${entry.id}`,
          createdAt: entry.updatedAt?.getTime() ?? 0,
          date: entry.date,
          entry,
        });
      }
    }

    if (filter === "reminders") {
      // Soonest upcoming first (shown at the bottom), then past reminders.
      const time = (r: Row) => (r.kind === "message" ? r.entry.remindAt?.getTime() ?? 0 : 0);
      items.sort((a, b) => {
        const ta = time(a);
        const tb = time(b);
        const fa = ta > now;
        const fb = tb > now;
        if (fa !== fb) return fa ? -1 : 1;
        return fa ? ta - tb : tb - ta;
      });
      return items as Row[];
    }

    // Newest first: the list is inverted so it reads like a chat (newest at the bottom).
    items.sort((a, b) => (a.date === b.date ? b.createdAt - a.createdAt : a.date < b.date ? 1 : -1));
    const out: Row[] = [];
    for (let i = 0; i < items.length; i++) {
      out.push(items[i]);
      const next = items[i + 1];
      if (!next || next.date !== items[i].date) {
        out.push({ kind: "day", key: `d-${items[i].date}`, date: items[i].date });
      }
    }
    return out;
  }, [messages, habitEntries, focusVideos, habitById, query, filter, tagFilter, habitFilter, now]);

  const resultCount = rows.filter((r) => r.kind !== "day").length;

  // Opened from a reminder notification: clear filters and jump to the message.
  useEffect(() => {
    const id = Number(params.entry);
    if (!id) return;
    const open = setTimeout(() => {
      setQuery("");
      setFilter("all");
      setTagFilter(null);
      setHabitFilter(null);
      setHighlightId(id);
      router.setParams({ entry: undefined });
    }, 0);
    const clear = setTimeout(() => setHighlightId(null), 4000);
    return () => {
      clearTimeout(open);
      clearTimeout(clear);
    };
  }, [params.entry]);

  useEffect(() => {
    if (highlightId == null) return;
    const index = rows.findIndex((r) => r.kind === "message" && r.entry.id === highlightId);
    if (index >= 0) {
      requestAnimationFrame(() =>
        listRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.5 }),
      );
    }
  }, [highlightId, rows]);

  const openActions = useCallback((entry: ParsedJournalEntry) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const shareText = [entry.note, ...entry.links].filter(Boolean).join("\n");
    const actions: { label: string; destructive?: boolean; run: () => void }[] = [
      { label: "Edit", run: () => setEditing(entry) },
      {
        label: entry.remindAt ? "Change reminder" : "Remind me",
        run: async () => {
          if (!(await ensureReminderPermission())) {
            Alert.alert("Notifications are off", "Allow notifications for 1Per in Settings to get reminders.");
            return;
          }
          setReminderFor(entry);
        },
      },
    ];
    const linked = entry.habitId ? habitById.get(entry.habitId) : undefined;
    if (entry.habitId) {
      actions.push({
        label: `Unlink ${linked?.title ?? "habit"}`,
        run: () =>
          Alert.alert(
            `Unlink ${linked?.title ?? "habit"}?`,
            "Also uncheck the habit for that day?",
            [
              { text: "Cancel", style: "cancel" },
              { text: "Keep checked", onPress: () => void unlinkJournalHabit(entry, false) },
              { text: "Uncheck", style: "destructive", onPress: () => void unlinkJournalHabit(entry, true) },
            ],
          ),
      });
    } else if (activeHabits.length) {
      actions.push({
        label: "Log habit…",
        run: () => {
          const labels = activeHabits.map((h) => h.title);
          const choose = (index: number) => {
            const habit = activeHabits[index];
            if (habit) void linkJournalHabit(entry, habit.id);
          };
          if (Platform.OS === "ios") {
            ActionSheetIOS.showActionSheetWithOptions(
              { title: "Log a habit", message: "Marks it done for that day", options: [...labels, "Cancel"], cancelButtonIndex: labels.length },
              choose,
            );
          } else {
            Alert.alert("Log a habit", undefined, [
              ...labels.slice(0, 8).map((label, i) => ({ text: label, onPress: () => choose(i) })),
              { text: "Cancel", style: "cancel" as const },
            ]);
          }
        },
      });
    }
    if (shareText) {
      actions.push({ label: "Copy text", run: () => void Clipboard.setStringAsync(shareText) });
      actions.push({ label: "Share", run: () => void Share.share({ message: shareText }) });
    }
    actions.push({
      label: "Delete",
      destructive: true,
      run: () =>
        Alert.alert("Delete message?", "It will be permanently removed with its attachments.", [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            style: "destructive",
            onPress: () => {
              if (editing?.id === entry.id) setEditing(null);
              void deleteJournalMessage(entry);
            },
          },
        ]),
    });

    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: [...actions.map((a) => a.label), "Cancel"],
          destructiveButtonIndex: actions.findIndex((a) => a.destructive),
          cancelButtonIndex: actions.length,
        },
        (index) => actions[index]?.run(),
      );
    } else {
      Alert.alert("Message", undefined, [
        ...actions.map((a) => ({
          text: a.label,
          style: a.destructive ? ("destructive" as const) : ("default" as const),
          onPress: a.run,
        })),
        { text: "Cancel", style: "cancel" as const },
      ]);
    }
  }, [editing, habitById, activeHabits]);

  const onToggleItem = useCallback((entry: ParsedJournalEntry, itemId: string) => {
    Haptics.selectionAsync();
    void toggleChecklistItem(entry, itemId);
  }, []);

  const onTagPress = useCallback((tag: string) => {
    setTagFilter((current) => (current === tag ? null : tag));
  }, []);

  const onHabitPress = useCallback((habitId: number) => {
    setHabitFilter((current) => (current === habitId ? null : habitId));
  }, []);

  const clearFilters = () => {
    setQuery("");
    setFilter("all");
    setTagFilter(null);
    setHabitFilter(null);
  };

  const renderRow = ({ item }: { item: Row }) => {
    if (item.kind === "day") {
      return (
        <View style={s.dayRow}>
          <Text style={s.dayLabel}>{formatDay(item.date)}</Text>
        </View>
      );
    }
    if (item.kind === "message") {
      return (
        <MessageBubble
          entry={item.entry}
          highlighted={highlightId === item.entry.id}
          onLongPress={openActions}
          onToggleItem={onToggleItem}
          onOpenMedia={setViewer}
          onTagPress={onTagPress}
          now={now}
          habit={item.entry.habitId ? habitById.get(item.entry.habitId) ?? null : null}
          onHabitPress={onHabitPress}
        />
      );
    }
    if (item.kind === "focus") {
      const { entry } = item;
      return (
        <Pressable
          style={s.activity}
          onPress={() => setViewer({ kind: "video", uri: entry.videoUri! })}
          accessibilityRole="button"
          accessibilityLabel="Play focus session video"
        >
          <View style={s.activityIcon}>
            <Ionicons name="videocam" size={14} color={C.accentText} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.activityTitle}>
              Focus session{entry.focusMinutes > 0 ? ` · ${entry.focusMinutes} min` : ""}
            </Text>
            {entry.goal ? <Text style={s.activityNote} numberOfLines={2}>{entry.goal}</Text> : null}
          </View>
          <Ionicons name="play-circle" size={26} color={C.accentText} />
        </Pressable>
      );
    }
    const { entry } = item;
    const habit = habitById.get(entry.habitId);
    return (
      <View style={s.activity}>
        <View style={s.activityIcon}>
          <Ionicons
            name={resolveIoniconName(habit?.icon ?? null, "star-outline")}
            size={14}
            color={C.accentText}
          />
        </View>
        <View style={{ flex: 1, gap: 6 }}>
          <Text style={s.activityTitle}>{habit?.title ?? "Habit"} · check-in</Text>
          {entry.note ? <Text style={s.activityNote}>{entry.note}</Text> : null}
        </View>
        {entry.photoUri ? (
          <Pressable onPress={() => setViewer({ kind: "photo", uri: entry.photoUri! })}>
            <Image source={{ uri: entry.photoUri }} style={s.activityPhoto} />
          </Pressable>
        ) : null}
      </View>
    );
  };

  return (
    <View style={s.container}>
      <GradientBackground />

      <View style={[s.header, { paddingTop: insets.top + 12 }]}>
        <Text style={s.title}>Journal</Text>
        <View style={s.searchBox}>
          <Ionicons name="search" size={16} color={C.textTertiary} />
          <TextInput
            style={s.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder="Search notes, links, files, #tags"
            placeholderTextColor={C.textQuaternary}
            returnKeyType="search"
            autoCorrect={false}
            autoCapitalize="none"
            clearButtonMode="while-editing"
          />
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.chips}
          keyboardShouldPersistTaps="handled"
        >
          {FILTERS.map((f) => {
            const active = filter === f.id;
            const badge = f.id === "reminders" && upcomingCount ? ` ${upcomingCount}` : "";
            return (
              <Pressable
                key={f.id}
                style={[s.chip, active && s.chipActive]}
                onPress={() => setFilter(f.id)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
              >
                <Ionicons name={f.icon} size={13} color={active ? C.textInverse : C.textSecondary} />
                <Text style={[s.chipText, active && s.chipTextActive]}>
                  {f.label}
                  {badge}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
        {tagCounts.length || habitCounts.length ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={s.chips}
            keyboardShouldPersistTaps="handled"
          >
            {habitCounts.map(([id, count]) => {
              const habit = habitById.get(id)!;
              const active = habitFilter === id;
              return (
                <Pressable
                  key={`habit-${id}`}
                  style={[s.tagChip, s.habitChip, active && s.chipActive]}
                  onPress={() => onHabitPress(id)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                >
                  <Ionicons
                    name={resolveIoniconName(habit.icon ?? null, "star-outline")}
                    size={12}
                    color={active ? C.textInverse : C.accentText}
                  />
                  <Text style={[s.tagChipText, active && s.chipTextActive]}>
                    {habit.title} <Text style={s.tagCount}>{count}</Text>
                  </Text>
                </Pressable>
              );
            })}
            {tagCounts.map(([tag, count]) => {
              const active = tagFilter === tag;
              return (
                <Pressable
                  key={tag}
                  style={[s.tagChip, active && s.chipActive]}
                  onPress={() => onTagPress(tag)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                >
                  <Text style={[s.tagChipText, active && s.chipTextActive]}>
                    #{tag} <Text style={s.tagCount}>{count}</Text>
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        ) : null}
        {isFiltering ? (
          <View style={s.resultsRow}>
            <Text style={s.resultsText}>
              {resultCount} result{resultCount === 1 ? "" : "s"}
            </Text>
            <Pressable onPress={clearFilters} hitSlop={8}>
              <Text style={s.clearText}>Clear</Text>
            </Pressable>
          </View>
        ) : null}
      </View>

      {rows.length === 0 ? (
        <View style={s.emptyState}>
          <Ionicons
            name={isFiltering ? "search-outline" : "chatbubble-ellipses-outline"}
            size={30}
            color={C.iconTertiary}
          />
          <Text style={s.emptyTitle}>{isFiltering ? "Nothing found" : "Message yourself"}</Text>
          <Text style={s.emptyBody}>
            {isFiltering
              ? "Try another word, tag, or filter."
              : "Jot down thoughts, save links, drop in photos, videos and files. Add #tags to find them later, turn notes into checklists, and set reminders."}
          </Text>
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={rows}
          inverted
          keyExtractor={(r) => r.key}
          renderItem={renderRow}
          contentContainerStyle={s.listContent}
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
          onScrollToIndexFailed={({ index }) =>
            setTimeout(() => listRef.current?.scrollToIndex({ index, animated: true }), 250)
          }
        />
      )}

      <KeyboardStickyView offset={{ closed: 0, opened: insets.bottom }}>
        <View style={{ paddingBottom: insets.bottom }}>
          <Composer
            editing={editing}
            onCancelEdit={() => setEditing(null)}
            onSent={() => {
              setEditing(null);
              if (!isFiltering) listRef.current?.scrollToOffset({ offset: 0, animated: true });
            }}
            knownTags={knownTags}
            habits={activeHabits}
          />
        </View>
      </KeyboardStickyView>

      <ReminderSheet
        visible={!!reminderFor}
        current={reminderFor?.remindAt ?? null}
        onClose={() => setReminderFor(null)}
        onPick={(date) => {
          if (reminderFor) void setJournalReminder(reminderFor, date);
          setReminderFor(null);
        }}
      />

      <MediaViewer media={viewer} onClose={() => setViewer(null)} />
    </View>
  );
}

function makeStyles(C: ReturnType<typeof useTheme>) {
  return StyleSheet.create({
    container: { flex: 1 },
    header: { paddingHorizontal: 16, gap: 10, paddingBottom: 8 },
    title: { fontSize: 28, fontWeight: "700", color: C.textPrimary, paddingHorizontal: 4 },
    searchBox: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      height: 40,
      paddingHorizontal: 12,
      borderRadius: 12,
      backgroundColor: C.inputBg,
      borderWidth: 1,
      borderColor: C.inputBorder,
    },
    searchInput: { flex: 1, fontSize: 15, color: C.textPrimary },
    chips: { gap: 6, paddingHorizontal: 2 },
    chip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      height: 30,
      paddingHorizontal: 11,
      borderRadius: 15,
      backgroundColor: C.cardBg,
      borderWidth: 1,
      borderColor: C.cardBorder,
    },
    chipActive: { backgroundColor: C.accent, borderColor: C.accent },
    chipText: { fontSize: 13, fontWeight: "600", color: C.textSecondary },
    chipTextActive: { color: C.textInverse },
    tagChip: {
      height: 26,
      paddingHorizontal: 10,
      borderRadius: 13,
      justifyContent: "center",
      backgroundColor: C.accentBgSubtle,
      borderWidth: 1,
      borderColor: C.accentBorderSubtle,
    },
    tagChipText: { fontSize: 12, fontWeight: "600", color: C.accentText },
    tagCount: { fontWeight: "400", opacity: 0.7 },
    habitChip: { flexDirection: "row", alignItems: "center", gap: 5 },
    resultsRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      paddingHorizontal: 4,
    },
    resultsText: { fontSize: 12, color: C.textTertiary },
    clearText: { fontSize: 12, fontWeight: "700", color: C.accentText },
    listContent: { paddingHorizontal: 12, paddingVertical: 12 },
    dayRow: { alignItems: "center", marginVertical: 10 },
    dayLabel: {
      fontSize: 11,
      fontWeight: "700",
      letterSpacing: 1,
      color: C.textTertiary,
      textTransform: "uppercase",
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 10,
      backgroundColor: C.cardBg,
      overflow: "hidden",
    },
    activity: {
      alignSelf: "flex-start",
      maxWidth: "86%",
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      padding: 10,
      marginBottom: 8,
      borderRadius: 16,
      borderBottomLeftRadius: 6,
      backgroundColor: C.cardBg,
      borderWidth: 1,
      borderColor: C.cardBorder,
    },
    activityIcon: {
      width: 28,
      height: 28,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: C.accentBgSubtle,
      borderWidth: 1,
      borderColor: C.accentBorder,
    },
    activityTitle: { fontSize: 13, fontWeight: "700", color: C.textPrimary },
    activityNote: { fontSize: 14, lineHeight: 19, color: C.textSecondary },
    activityPhoto: { width: 56, height: 56, borderRadius: 10 },
    emptyState: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 32,
      gap: 10,
    },
    emptyTitle: { fontSize: 17, fontWeight: "700", color: C.textPrimary },
    emptyBody: { fontSize: 14, color: C.textTertiary, textAlign: "center", lineHeight: 20 },
  });
}
