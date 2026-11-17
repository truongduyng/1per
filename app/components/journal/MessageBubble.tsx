import { useTheme } from "@/hooks/useTheme";
import { resolveIoniconName } from "@/lib/iconNames";
import {
  displayLink,
  formatFileSize,
  formatReminder,
  type JournalAttachment,
  type ParsedJournalEntry,
} from "@/lib/journal";
import { Ionicons } from "@expo/vector-icons";
import * as Sharing from "expo-sharing";
import * as WebBrowser from "expo-web-browser";
import React, { useState } from "react";
import { Alert, Image, Pressable, StyleSheet, Text, View } from "react-native";
import type { ViewerMedia } from "./MediaViewer";

interface Props {
  entry: ParsedJournalEntry;
  highlighted?: boolean;
  onLongPress: (entry: ParsedJournalEntry) => void;
  onToggleItem: (entry: ParsedJournalEntry, itemId: string) => void;
  onOpenMedia: (media: ViewerMedia) => void;
  onTagPress: (tag: string) => void;
  now: number;
  habit: { id: number; title: string; icon: string | null } | null;
  onHabitPress: (habitId: number) => void;
}

function timeOf(date: Date) {
  return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

export async function openFile(attachment: JournalAttachment) {
  try {
    if (!(await Sharing.isAvailableAsync())) throw new Error("Sharing unavailable");
    await Sharing.shareAsync(attachment.uri, {
      mimeType: attachment.mimeType ?? undefined,
      dialogTitle: attachment.name ?? "File",
    });
  } catch (error) {
    console.warn("Failed to open file:", error);
    Alert.alert("Couldn't open file", "The file may no longer be on this device.");
  }
}

/** Splits text so #tags and URLs render as tappable spans. */
function RichText({
  text,
  style,
  tagStyle,
  linkStyle,
  onTagPress,
}: {
  text: string;
  style: object;
  tagStyle: object;
  linkStyle: object;
  onTagPress: (tag: string) => void;
}) {
  const parts = text.split(/(\bhttps?:\/\/[^\s<>"')\]]+|(?:^|(?<=\s))#[\p{L}\p{N}_-]+)/u);
  return (
    <Text style={style} selectable>
      {parts.map((part, i) => {
        if (!part) return null;
        if (/^#[\p{L}\p{N}_-]+$/u.test(part) && !/^#\d+$/.test(part)) {
          return (
            <Text key={i} style={tagStyle} onPress={() => onTagPress(part.slice(1).toLowerCase())}>
              {part}
            </Text>
          );
        }
        if (/^https?:\/\//i.test(part)) {
          return (
            <Text key={i} style={linkStyle} onPress={() => WebBrowser.openBrowserAsync(part)}>
              {part}
            </Text>
          );
        }
        return <Text key={i}>{part}</Text>;
      })}
    </Text>
  );
}

function MediaTile({
  attachment,
  size,
  onPress,
}: {
  attachment: { kind: "photo" | "video"; uri: string };
  size: { width: number | `${number}%`; aspectRatio: number };
  onPress: () => void;
}) {
  const C = useTheme();
  return (
    <Pressable onPress={onPress} style={[size, { borderRadius: 12, overflow: "hidden" }]}>
      {attachment.kind === "photo" ? (
        <Image source={{ uri: attachment.uri }} style={{ flex: 1, backgroundColor: C.inputBg }} resizeMode="cover" />
      ) : (
        <View style={{ flex: 1, backgroundColor: "#1c1c1c", alignItems: "center", justifyContent: "center" }}>
          <View style={tileStyles.play}>
            <Ionicons name="play" size={20} color="#fff" />
          </View>
        </View>
      )}
    </Pressable>
  );
}

const tileStyles = StyleSheet.create({
  play: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.18)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.3)",
  },
});

export function MessageBubble({ entry, highlighted, onLongPress, onToggleItem, onOpenMedia, onTagPress, now, habit, onHabitPress }: Props) {
  const C = useTheme();
  const s = makeStyles(C);
  const [singleRatio, setSingleRatio] = useState<number | null>(null);

  const visual: { kind: "photo" | "video"; uri: string; ratio: number | null }[] = [];
  if (entry.photoUri) visual.push({ kind: "photo", uri: entry.photoUri, ratio: null });
  for (const a of entry.attachments) {
    if (a.kind !== "file") {
      visual.push({ kind: a.kind, uri: a.uri, ratio: a.width && a.height ? a.width / a.height : null });
    }
  }
  const files = entry.attachments.filter((a) => a.kind === "file");
  // Links already visible inline in the note don't need a separate card.
  const linkCards = entry.links.filter((l) => !entry.note.includes(l)).concat(
    entry.links.filter((l) => entry.note.includes(l)).slice(0, 1),
  );
  const done = entry.checklist.filter((c) => c.done).length;
  const reminderPast = entry.remindAt && entry.remindAt.getTime() <= now;

  return (
    <Pressable
      onLongPress={() => onLongPress(entry)}
      delayLongPress={300}
      style={[s.bubble, highlighted && s.highlighted]}
      accessibilityHint="Long press for options"
    >
      {habit ? (
        <Pressable style={s.habitChip} onPress={() => onHabitPress(habit.id)} hitSlop={4}>
          <Ionicons name="checkmark-circle" size={14} color={C.accentText} />
          <Ionicons name={resolveIoniconName(habit.icon, "star-outline")} size={13} color={C.accentText} />
          <Text style={s.habitChipText} numberOfLines={1}>
            {habit.title}
          </Text>
        </Pressable>
      ) : null}
      {visual.length === 1 ? (
        <MediaTile
          attachment={visual[0]}
          size={{ width: "100%", aspectRatio: Math.max(0.6, Math.min(2, visual[0].ratio ?? singleRatio ?? 4 / 3)) }}
          onPress={() => onOpenMedia({ kind: visual[0].kind, uri: visual[0].uri })}
        />
      ) : visual.length > 1 ? (
        <View style={s.grid}>
          {visual.slice(0, 6).map((v, i) => (
            <View key={`${v.uri}-${i}`} style={s.gridCell}>
              <MediaTile
                attachment={v}
                size={{ width: "100%", aspectRatio: 1 }}
                onPress={() => onOpenMedia({ kind: v.kind, uri: v.uri })}
              />
              {i === 5 && visual.length > 6 ? (
                <View style={s.moreOverlay} pointerEvents="none">
                  <Text style={s.moreText}>+{visual.length - 6}</Text>
                </View>
              ) : null}
            </View>
          ))}
        </View>
      ) : null}
      {visual.length === 1 && visual[0].kind === "photo" && !visual[0].ratio ? (
        // Measure the legacy photo once so it isn't cropped to 4:3.
        <Image
          source={{ uri: visual[0].uri }}
          style={{ width: 1, height: 1, position: "absolute", opacity: 0 }}
          onLoad={(e) => {
            const { width, height } = e.nativeEvent.source;
            if (width > 0 && height > 0) setSingleRatio(width / height);
          }}
        />
      ) : null}

      {entry.note ? (
        <RichText
          text={entry.note}
          style={s.note}
          tagStyle={s.inlineTag}
          linkStyle={s.inlineLink}
          onTagPress={onTagPress}
        />
      ) : null}

      {entry.checklist.length ? (
        <View style={s.checklist}>
          <Text style={s.checklistMeta}>
            {done}/{entry.checklist.length} done
          </Text>
          {entry.checklist.map((item) => (
            <Pressable
              key={item.id}
              style={s.checkRow}
              onPress={() => onToggleItem(entry, item.id)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: item.done }}
              accessibilityLabel={item.text}
            >
              <Ionicons
                name={item.done ? "checkmark-circle" : "ellipse-outline"}
                size={20}
                color={item.done ? C.accentText : C.textTertiary}
                style={s.checkIcon}
              />
              <Text style={[s.checkText, item.done && s.checkTextDone]}>{item.text}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {linkCards.map((url) => (
        <Pressable key={url} style={s.card} onPress={() => WebBrowser.openBrowserAsync(url)}>
          <View style={s.cardIcon}>
            <Ionicons name="link" size={16} color={C.accentText} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.cardTitle} numberOfLines={1}>
              {displayLink(url).split("/")[0]}
            </Text>
            <Text style={s.cardMeta} numberOfLines={1}>
              {displayLink(url)}
            </Text>
          </View>
          <Ionicons name="open-outline" size={16} color={C.textTertiary} />
        </Pressable>
      ))}

      {files.map((file) => (
        <Pressable key={file.id} style={s.card} onPress={() => openFile(file)}>
          <View style={s.cardIcon}>
            <Ionicons name="document-text-outline" size={16} color={C.accentText} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.cardTitle} numberOfLines={1}>
              {file.name ?? "File"}
            </Text>
            <Text style={s.cardMeta} numberOfLines={1}>
              {[file.mimeType?.split("/").pop()?.toUpperCase(), formatFileSize(file.size)]
                .filter(Boolean)
                .join(" · ") || "Tap to open"}
            </Text>
          </View>
          <Ionicons name="share-outline" size={16} color={C.textTertiary} />
        </Pressable>
      ))}

      <View style={s.footer}>
        {entry.tags
          .filter((t) => !entry.note.toLowerCase().includes(`#${t}`))
          .map((tag) => (
            <Pressable key={tag} onPress={() => onTagPress(tag)} hitSlop={4}>
              <Text style={s.footerTag}>#{tag}</Text>
            </Pressable>
          ))}
        {entry.remindAt ? (
          <View style={[s.reminderPill, reminderPast && s.reminderPast]}>
            <Ionicons name={reminderPast ? "alarm-outline" : "alarm"} size={12} color={reminderPast ? C.textTertiary : C.accentText} />
            <Text style={[s.reminderText, reminderPast && { color: C.textTertiary }]}>
              {formatReminder(entry.remindAt)}
            </Text>
          </View>
        ) : null}
        <Text style={s.time}>
          {timeOf(entry.createdAt)}
          {entry.updatedAt && entry.updatedAt.getTime() - entry.createdAt.getTime() > 60_000 ? " · edited" : ""}
        </Text>
      </View>
    </Pressable>
  );
}

function makeStyles(C: ReturnType<typeof useTheme>) {
  return StyleSheet.create({
    bubble: {
      alignSelf: "stretch",
      backgroundColor: C.cardBg,
      borderWidth: 1,
      borderColor: C.cardBorder,
      borderRadius: 18,
      borderBottomRightRadius: 6,
      padding: 10,
      gap: 8,
      marginBottom: 8,
    },
    highlighted: { borderColor: C.accent, borderWidth: 2 },
    habitChip: {
      flexDirection: "row",
      alignItems: "center",
      alignSelf: "flex-start",
      gap: 4,
      maxWidth: "100%",
      paddingHorizontal: 8,
      height: 24,
      borderRadius: 12,
      backgroundColor: C.accentBg,
    },
    habitChipText: { flexShrink: 1, fontSize: 12, fontWeight: "700", color: C.accentText },
    note: { fontSize: 16, lineHeight: 24, color: C.textPrimary },
    inlineTag: { color: C.accentText, fontWeight: "600" },
    inlineLink: { color: C.accentText, textDecorationLine: "underline" },
    grid: { flexDirection: "row", flexWrap: "wrap", gap: 4, width: 240 },
    gridCell: { width: 118 },
    moreOverlay: {
      ...StyleSheet.absoluteFill,
      borderRadius: 12,
      backgroundColor: "rgba(0,0,0,0.5)",
      alignItems: "center",
      justifyContent: "center",
    },
    moreText: { color: "#fff", fontSize: 20, fontWeight: "700" },
    checklist: { gap: 2 },
    checklistMeta: { fontSize: 12, fontWeight: "600", color: C.textSecondary },
    checkRow: { flexDirection: "row", alignItems: "flex-start", gap: 8, minHeight: 44, paddingVertical: 12 },
    checkIcon: { flexShrink: 0 },
    checkText: { flex: 1, minWidth: 0, fontSize: 16, lineHeight: 24, color: C.textPrimary },
    checkTextDone: { color: C.textTertiary, textDecorationLine: "line-through" },
    card: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      padding: 10,
      borderRadius: 12,
      backgroundColor: C.cardBg,
      borderWidth: 1,
      borderColor: C.cardBorder,
    },
    cardIcon: {
      width: 32,
      height: 32,
      borderRadius: 8,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: C.accentBg,
    },
    cardTitle: { fontSize: 14, fontWeight: "600", color: C.textPrimary },
    cardMeta: { fontSize: 12, color: C.textTertiary, marginTop: 1 },
    footer: {
      flexDirection: "row",
      flexWrap: "wrap",
      alignItems: "center",
      justifyContent: "flex-end",
      gap: 8,
    },
    footerTag: { fontSize: 12, fontWeight: "600", color: C.accentText },
    reminderPill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingHorizontal: 8,
      height: 22,
      borderRadius: 11,
      backgroundColor: C.accentBg,
    },
    reminderPast: { backgroundColor: C.cardBg },
    reminderText: { fontSize: 11, fontWeight: "600", color: C.accentText },
    time: { fontSize: 12, color: C.textTertiary },
  });
}
