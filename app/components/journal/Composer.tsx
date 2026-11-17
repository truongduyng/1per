import { MediaSheet } from "./media-sheet";
import { useTheme } from "@/hooks/useTheme";
import {
  extractLinks,
  type JournalAttachment,
  type ParsedJournalEntry,
} from "@/lib/journal";
import {
  MAX_ATTACHMENTS,
  createJournalMessage,
  discardAttachments,
  updateJournalMessage,
} from "@/lib/journalActions";
import { useVoiceTranscription } from "@/lib/voiceTranscription";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

export const MESSAGE_MAX_LENGTH = 5000;
const INPUT_MIN_HEIGHT = 40;
const INPUT_MAX_HEIGHT = 140;

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
  const [inputHeight, setInputHeight] = useState(INPUT_MIN_HEIGHT);
  const [attachments, setAttachments] = useState<JournalAttachment[]>([]);
  const [photoUri, setPhotoUri] = useState<string | null>(null); // legacy photo when editing
  const [sending, setSending] = useState(false);
  const [mediaOpen, setMediaOpen] = useState(false);
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
    setInputHeight(INPUT_MIN_HEIGHT);
    setAttachments([]);
    setPhotoUri(null);
    freshIds.current.clear();
  };

  // Load the message being edited into the composer.
  useEffect(() => {
    if (!editing) return;
    setText(editing.note || editing.checklist.map((item) => `- [${item.done ? "x" : " "}] ${item.text}`).join("\n"));
    setAttachments(editing.attachments);
    setPhotoUri(editing.photoUri);
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
  const removeAttachment = (attachment: JournalAttachment) => {
    if (freshIds.current.has(attachment.id)) {
      discardAttachments([attachment]);
      freshIds.current.delete(attachment.id);
    }
    setAttachments((prev) => prev.filter((a) => a.id !== attachment.id));
  };

  const openMenu = () => {
    if (remaining <= 0) {
      Alert.alert("Attachment limit", `A message can hold up to ${MAX_ATTACHMENTS} attachments.`);
      return;
    }
    Keyboard.dismiss();
    setMediaOpen(true);
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

  const canSend =
    !sending &&
    (text.trim().length > 0 || attachments.length > 0 || !!photoUri);

  const send = async () => {
    if (!canSend) return;
    if (isRecording) voice.stop();
    setSending(true);
    try {
      const draft = {
        habitId: editing?.habitId ?? null,
        note: text,
        photoUri,
        tags: [], // derived from #hashtags in the text
        links: extractLinks(text),
        attachments,
        checklist: editing?.checklist ?? [],
        remindAt: editing?.remindAt ?? null,
      };
      const saved = editing
        ? await updateJournalMessage(editing, draft)
        : await createJournalMessage(draft);
      if (!saved) throw new Error("The message could not be saved.");
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

  const hasPending = attachments.length > 0 || !!photoUri;

  return (
    <View style={s.wrap}>
      {editing ? (
        <View style={s.editBanner}>
          <Ionicons name="create-outline" size={14} color={C.accentText} />
          <Text style={s.editBannerText}>Editing message</Text>
          <Pressable onPress={cancelEdit} disabled={sending} hitSlop={10} accessibilityLabel="Cancel editing">
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
            <Pressable key={tag} style={s.suggestion} onPress={() => applyTag(tag)} disabled={sending}>
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
                <Pressable onPress={() => removeAttachment(a)} hitSlop={8} accessibilityLabel="Remove file" disabled={sending}>
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

      <View style={s.bar}>
        <Pressable
          style={s.roundBtn}
          onPress={openMenu}
          accessibilityRole="button"
          accessibilityLabel="Attach photos or videos"
          disabled={sending}
        >
          <Ionicons name="add" size={22} color={C.accentText} />
        </Pressable>
        <TextInput
          ref={inputRef}
          style={[
            s.input,
            { height: text.length === 0 ? INPUT_MIN_HEIGHT : inputHeight },
            isRecording && s.inputRecording,
          ]}
          value={text}
          onChangeText={setText}
          onContentSizeChange={({ nativeEvent }) => {
            setInputHeight(Math.min(
              INPUT_MAX_HEIGHT,
              Math.max(INPUT_MIN_HEIGHT, Math.ceil(nativeEvent.contentSize.height) + 2),
            ));
          }}
          placeholder={isRecording ? "Listening…" : "Message yourself…"}
          placeholderTextColor={C.textQuaternary}
          multiline
          maxLength={MESSAGE_MAX_LENGTH}
          editable={!isRecording && !sending}
        />
        {sending ? (
          <View style={[s.roundBtn, s.sendBtn]} accessibilityLabel="Saving message" accessibilityRole="progressbar">
            <ActivityIndicator size="small" color={C.accentForeground} />
          </View>
        ) : canSend && !isRecording ? (
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

      {mediaOpen ? <MediaSheet
        visible={mediaOpen}
        remaining={remaining}
        onClose={() => setMediaOpen(false)}
        onPick={(picked) => {
          addAttachments(picked);
          setMediaOpen(false);
        }}
      /> : null}
    </View>
  );

  function RemoveBadge({ onPress }: { onPress: () => void }) {
    return (
      <Pressable style={s.removeBadge} onPress={onPress} hitSlop={8} accessibilityLabel="Remove" disabled={sending}>
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
      minHeight: INPUT_MIN_HEIGHT,
      maxHeight: INPUT_MAX_HEIGHT,
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
