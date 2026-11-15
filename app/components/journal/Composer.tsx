import { useTheme } from "@/hooks/useTheme";
import {
  ensureReminderPermission,
  extractLinks,
  formatReminder,
  newLocalId,
  type JournalAttachment,
  type JournalChecklistItem,
  type ParsedJournalEntry,
} from "@/lib/journal";
import {
  MAX_ATTACHMENTS,
  createJournalMessage,
  discardAttachments,
  pickJournalFiles,
  pickJournalMedia,
  updateJournalMessage,
} from "@/lib/journalActions";
import { useVoiceTranscription } from "@/lib/voiceTranscription";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActionSheetIOS,
  Alert,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { ReminderSheet } from "./ReminderSheet";

export const MESSAGE_MAX_LENGTH = 5000;

interface Props {
  editing: ParsedJournalEntry | null;
  onCancelEdit: () => void;
  onSent: (entry: ParsedJournalEntry | null) => void;
  knownTags: string[];
}

export function Composer({ editing, onCancelEdit, onSent, knownTags }: Props) {
  const C = useTheme();
  const s = makeStyles(C);
  const inputRef = useRef<TextInput>(null);

  const [text, setText] = useState("");
  const [attachments, setAttachments] = useState<JournalAttachment[]>([]);
  const [photoUri, setPhotoUri] = useState<string | null>(null); // legacy photo when editing
  const [checklist, setChecklist] = useState<JournalChecklistItem[] | null>(null);
  const [remindAt, setRemindAt] = useState<Date | null>(null);
  const [reminderOpen, setReminderOpen] = useState(false);
  const [sending, setSending] = useState(false);
  // Attachments picked in this composing session; removed from disk if never sent.
  const freshIds = useRef(new Set<string>());

  const voice = useVoiceTranscription(
    (spoken) => setText(spoken.slice(0, MESSAGE_MAX_LENGTH)),
    (message) => Alert.alert("Couldn't transcribe", message),
  );
  const isRecording = voice.status === "listening";

  const discardFresh = (list: JournalAttachment[]) => {
    discardAttachments(list.filter((a) => freshIds.current.has(a.id)));
    freshIds.current.clear();
  };

  const reset = () => {
    setText("");
    setAttachments([]);
    setPhotoUri(null);
    setChecklist(null);
    setRemindAt(null);
    freshIds.current.clear();
  };

  // Load the message being edited into the composer.
  useEffect(() => {
    if (!editing) return;
    setText(editing.note);
    setAttachments(editing.attachments);
    setPhotoUri(editing.photoUri);
    setChecklist(editing.checklist.length ? editing.checklist : null);
    setRemindAt(editing.remindAt);
    freshIds.current.clear();
    setTimeout(() => inputRef.current?.focus(), 50);
  }, [editing]);

  const cancelEdit = () => {
    discardFresh(attachments);
    reset();
    onCancelEdit();
  };

  // ── #tag autocomplete on the word being typed ──
  const tagPrefix = useMemo(() => {
    const match = text.match(/(^|\s)#([\p{L}\p{N}_-]*)$/u);
    return match ? match[2].toLowerCase() : null;
  }, [text]);
  const tagSuggestions = useMemo(() => {
    if (tagPrefix === null) return [];
    return knownTags.filter((t) => t.startsWith(tagPrefix) && t !== tagPrefix).slice(0, 8);
  }, [knownTags, tagPrefix]);
  const applyTag = (tag: string) => {
    setText((prev) => prev.replace(/#([\p{L}\p{N}_-]*)$/u, `#${tag} `));
  };

  // ── Attachments ──
  const addAttachments = (picked: JournalAttachment[]) => {
    if (!picked.length) return;
    for (const a of picked) freshIds.current.add(a.id);
    setAttachments((prev) => [...prev, ...picked]);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };
  const remaining = MAX_ATTACHMENTS - attachments.length - (photoUri ? 1 : 0);
  const pick = async (what: "camera" | "library" | "file") => {
    try {
      addAttachments(
        what === "file" ? await pickJournalFiles(remaining) : await pickJournalMedia(what, remaining),
      );
    } catch (error) {
      console.warn("Failed to attach:", error);
      Alert.alert("Couldn't attach", "Please try again.");
    }
  };
  const removeAttachment = (attachment: JournalAttachment) => {
    if (freshIds.current.has(attachment.id)) {
      discardAttachments([attachment]);
      freshIds.current.delete(attachment.id);
    }
    setAttachments((prev) => prev.filter((a) => a.id !== attachment.id));
  };

  const startChecklist = () => {
    setChecklist((prev) => prev ?? [{ id: newLocalId(), text: "", done: false }]);
  };

  const openReminder = async () => {
    if (!(await ensureReminderPermission())) {
      Alert.alert(
        "Notifications are off",
        "Allow notifications for 1Per in Settings to get reminders.",
      );
      return;
    }
    setReminderOpen(true);
  };

  const openMenu = () => {
    const options = [
      { label: "Camera", run: () => pick("camera") },
      { label: "Photos & Videos", run: () => pick("library") },
      { label: "File", run: () => pick("file") },
      { label: checklist ? "Add checklist item" : "Checklist", run: () => {
        if (checklist) setChecklist([...checklist, { id: newLocalId(), text: "", done: false }]);
        else startChecklist();
      } },
      { label: remindAt ? "Change reminder" : "Reminder", run: openReminder },
    ];
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: [...options.map((o) => o.label), "Cancel"], cancelButtonIndex: options.length },
        (index) => options[index]?.run(),
      );
    } else {
      Alert.alert("Add to message", undefined, [
        ...options.map((o) => ({ text: o.label, onPress: o.run })),
        { text: "Cancel", style: "cancel" as const },
      ]);
    }
  };

  const toggleRecording = async () => {
    if (isRecording) {
      voice.stop();
      return;
    }
    try {
      await voice.start(text);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (error) {
      console.warn("Failed to start speech recognition:", error);
      Alert.alert(
        "Microphone access needed",
        "Enable microphone and speech recognition access in Settings to dictate.",
      );
    }
  };

  const cleanChecklist = (checklist ?? []).filter((item) => item.text.trim().length > 0);
  const canSend =
    !sending &&
    (text.trim().length > 0 || attachments.length > 0 || !!photoUri || cleanChecklist.length > 0);

  const send = async () => {
    if (!canSend) return;
    if (isRecording) voice.stop();
    setSending(true);
    try {
      const draft = {
        note: text,
        photoUri,
        tags: [], // derived from #hashtags in the text
        links: extractLinks(text),
        attachments,
        checklist: cleanChecklist,
        remindAt: remindAt && remindAt.getTime() > Date.now() ? remindAt : null,
      };
      const saved = editing
        ? await updateJournalMessage(editing, draft)
        : await createJournalMessage(draft);
      freshIds.current.clear(); // now owned by the saved entry
      reset();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onSent(saved);
    } catch (error) {
      console.warn("Failed to save journal message:", error);
      Alert.alert("Couldn't save", "Please try again.");
    } finally {
      setSending(false);
    }
  };

  const hasPending = attachments.length > 0 || !!photoUri || !!remindAt;

  return (
    <View style={s.wrap}>
      {editing ? (
        <View style={s.editBanner}>
          <Ionicons name="create-outline" size={14} color={C.accentText} />
          <Text style={s.editBannerText}>Editing message</Text>
          <Pressable onPress={cancelEdit} hitSlop={10} accessibilityLabel="Cancel editing">
            <Ionicons name="close" size={16} color={C.textSecondary} />
          </Pressable>
        </View>
      ) : null}

      {tagSuggestions.length ? (
        <ScrollView
          horizontal
          keyboardShouldPersistTaps="always"
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.suggestions}
        >
          {tagSuggestions.map((tag) => (
            <Pressable key={tag} style={s.suggestion} onPress={() => applyTag(tag)}>
              <Text style={s.suggestionText}>#{tag}</Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}

      {hasPending ? (
        <ScrollView
          horizontal
          keyboardShouldPersistTaps="always"
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.pending}
        >
          {remindAt ? (
            <Pressable style={s.pendingChip} onPress={() => setReminderOpen(true)}>
              <Ionicons name="alarm" size={14} color={C.accentText} />
              <Text style={s.pendingChipText}>{formatReminder(remindAt)}</Text>
              <Pressable onPress={() => setRemindAt(null)} hitSlop={8} accessibilityLabel="Remove reminder">
                <Ionicons name="close-circle" size={16} color={C.textTertiary} />
              </Pressable>
            </Pressable>
          ) : null}
          {photoUri ? (
            <View style={s.thumb}>
              <Image source={{ uri: photoUri }} style={s.thumbImage} />
              <RemoveBadge onPress={() => setPhotoUri(null)} />
            </View>
          ) : null}
          {attachments.map((a) =>
            a.kind === "file" ? (
              <View key={a.id} style={s.pendingChip}>
                <Ionicons name="document-outline" size={14} color={C.accentText} />
                <Text style={s.pendingChipText} numberOfLines={1}>
                  {a.name ?? "File"}
                </Text>
                <Pressable onPress={() => removeAttachment(a)} hitSlop={8} accessibilityLabel="Remove file">
                  <Ionicons name="close-circle" size={16} color={C.textTertiary} />
                </Pressable>
              </View>
            ) : (
              <View key={a.id} style={s.thumb}>
                {a.kind === "photo" ? (
                  <Image source={{ uri: a.uri }} style={s.thumbImage} />
                ) : (
                  <View style={[s.thumbImage, s.videoThumb]}>
                    <Ionicons name="videocam" size={18} color="#fff" />
                  </View>
                )}
                <RemoveBadge onPress={() => removeAttachment(a)} />
              </View>
            ),
          )}
        </ScrollView>
      ) : null}

      {checklist ? (
        <View style={s.checklist}>
          {checklist.map((item, index) => (
            <View key={item.id} style={s.checkRow}>
              <Ionicons
                name={item.done ? "checkmark-circle" : "ellipse-outline"}
                size={18}
                color={item.done ? C.accentText : C.textTertiary}
              />
              <TextInput
                style={s.checkInput}
                value={item.text}
                placeholder="List item"
                placeholderTextColor={C.textQuaternary}
                autoFocus={!editing && index === checklist.length - 1 && item.text === ""}
                onChangeText={(value) =>
                  setChecklist(checklist.map((c) => (c.id === item.id ? { ...c, text: value } : c)))
                }
                submitBehavior="submit"
                returnKeyType="next"
                onSubmitEditing={() =>
                  setChecklist([...checklist, { id: newLocalId(), text: "", done: false }])
                }
              />
              <Pressable
                hitSlop={8}
                onPress={() => {
                  const next = checklist.filter((c) => c.id !== item.id);
                  setChecklist(next.length ? next : null);
                }}
                accessibilityLabel="Remove item"
              >
                <Ionicons name="close" size={16} color={C.textTertiary} />
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}

      <View style={s.bar}>
        <Pressable
          style={s.roundBtn}
          onPress={openMenu}
          accessibilityRole="button"
          accessibilityLabel="Attach photo, video, file, checklist or reminder"
        >
          <Ionicons name="add" size={22} color={C.accentText} />
        </Pressable>
        <TextInput
          ref={inputRef}
          style={[s.input, isRecording && s.inputRecording]}
          value={text}
          onChangeText={setText}
          placeholder={isRecording ? "Listening…" : checklist ? "Add a note (optional)" : "Message yourself… #tag"}
          placeholderTextColor={C.textQuaternary}
          multiline
          maxLength={MESSAGE_MAX_LENGTH}
          editable={!isRecording}
        />
        {canSend && !isRecording ? (
          <Pressable
            style={[s.roundBtn, s.sendBtn]}
            onPress={send}
            accessibilityRole="button"
            accessibilityLabel={editing ? "Save message" : "Send message"}
          >
            <Ionicons name={editing ? "checkmark" : "arrow-up"} size={20} color={C.textInverse} />
          </Pressable>
        ) : (
          <Pressable
            style={[s.roundBtn, isRecording && s.sendBtn]}
            onPress={toggleRecording}
            accessibilityRole="button"
            accessibilityLabel={isRecording ? "Stop dictation" : "Dictate"}
          >
            <Ionicons
              name={isRecording ? "stop" : "mic-outline"}
              size={20}
              color={isRecording ? C.textInverse : C.accentText}
            />
          </Pressable>
        )}
      </View>

      <ReminderSheet
        visible={reminderOpen}
        current={remindAt}
        onClose={() => setReminderOpen(false)}
        onPick={(date) => {
          setRemindAt(date);
          setReminderOpen(false);
        }}
      />
    </View>
  );

  function RemoveBadge({ onPress }: { onPress: () => void }) {
    return (
      <Pressable style={s.removeBadge} onPress={onPress} hitSlop={8} accessibilityLabel="Remove">
        <Ionicons name="close" size={12} color="#fff" />
      </Pressable>
    );
  }
}

function makeStyles(C: ReturnType<typeof useTheme>) {
  return StyleSheet.create({
    wrap: {
      paddingHorizontal: 12,
      paddingTop: 8,
      paddingBottom: 8,
      backgroundColor: C.background,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: C.divider,
      gap: 8,
    },
    editBanner: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 4,
    },
    editBannerText: { flex: 1, fontSize: 12, fontWeight: "700", color: C.accentText },
    suggestions: { gap: 6, paddingHorizontal: 2 },
    suggestion: {
      paddingHorizontal: 10,
      height: 28,
      borderRadius: 14,
      justifyContent: "center",
      backgroundColor: C.accentBgSubtle,
      borderWidth: 1,
      borderColor: C.accentBorder,
    },
    suggestionText: { fontSize: 13, fontWeight: "600", color: C.accentText },
    pending: { gap: 8, alignItems: "center", paddingHorizontal: 2 },
    pendingChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      maxWidth: 220,
      height: 34,
      paddingHorizontal: 10,
      borderRadius: 17,
      backgroundColor: C.cardBg,
      borderWidth: 1,
      borderColor: C.cardBorder,
    },
    pendingChipText: { flexShrink: 1, fontSize: 12, fontWeight: "600", color: C.textSecondary },
    thumb: { width: 56, height: 56 },
    thumbImage: { width: 56, height: 56, borderRadius: 10, backgroundColor: C.inputBg },
    videoThumb: { alignItems: "center", justifyContent: "center", backgroundColor: "#222" },
    removeBadge: {
      position: "absolute",
      top: -4,
      right: -4,
      width: 20,
      height: 20,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "rgba(0,0,0,0.7)",
    },
    checklist: {
      backgroundColor: C.cardBg,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: C.cardBorder,
      paddingHorizontal: 12,
      paddingVertical: 4,
    },
    checkRow: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 38 },
    checkInput: { flex: 1, fontSize: 15, color: C.textPrimary, paddingVertical: 8 },
    bar: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
    roundBtn: {
      width: 38,
      height: 38,
      borderRadius: 19,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: C.accentBg,
      borderWidth: 1,
      borderColor: C.accentBorder,
    },
    sendBtn: { backgroundColor: C.accent, borderColor: C.accent },
    input: {
      flex: 1,
      minHeight: 38,
      maxHeight: 140,
      borderRadius: 19,
      paddingHorizontal: 14,
      paddingTop: 9,
      paddingBottom: 9,
      fontSize: 15,
      lineHeight: 20,
      color: C.textPrimary,
      backgroundColor: C.inputBg,
      borderWidth: 1,
      borderColor: C.inputBorder,
    },
    inputRecording: { borderColor: C.accentBorder, opacity: 0.8 },
  });
}
