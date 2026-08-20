import { useTheme } from "@/hooks/useTheme";
import { deleteHabitPhoto, persistHabitPhoto } from "@/lib/habitPhotos";
import { Ionicons } from "@expo/vector-icons";
import { BottomSheet, Host, RNHostView } from "@expo/ui";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import React, { useState } from "react";
import {
  Alert,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const NOTE_MAX_LENGTH = 500;

export interface HabitCheckInDraft {
  photoUri: string | null;
  note: string;
}

interface Props {
  visible: boolean;
  habitId: number;
  habitTitle: string;
  dateKey: string; // 'YYYY-MM-DD' the check-in belongs to
  isDone: boolean; // already checked in → edit mode
  initialPhotoUri?: string | null;
  initialNote?: string | null;
  onClose: () => void;
  onSubmit: (draft: HabitCheckInDraft) => Promise<void>;
  onUndo?: () => void;
}

export function HabitCheckInModal({
  visible,
  habitId,
  habitTitle,
  dateKey,
  isDone,
  initialPhotoUri,
  initialNote,
  onClose,
  onSubmit,
  onUndo,
}: Props) {
  const C = useTheme();
  const insets = useSafeAreaInsets();
  const [photoUri, setPhotoUri] = useState<string | null>(
    initialPhotoUri ?? null,
  );
  const [note, setNote] = useState(initialNote ?? "");
  const [saving, setSaving] = useState(false);

  const originalPhotoUri = initialPhotoUri ?? null;

  const handleClose = () => {
    // Drop a photo that was picked but never saved so it doesn't orphan on disk.
    if (photoUri && photoUri !== originalPhotoUri) deleteHabitPhoto(photoUri);
    onClose();
  };

  const pickPhoto = async (source: "camera" | "library") => {
    try {
      const permission =
        source === "camera"
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          source === "camera" ? "Camera access needed" : "Photo access needed",
          "Enable access in Settings to attach a photo to your check-in.",
        );
        return;
      }

      const options: ImagePicker.ImagePickerOptions = {
        mediaTypes: ["images"],
        allowsEditing: true,
        quality: 0.7,
      };
      const result =
        source === "camera"
          ? await ImagePicker.launchCameraAsync(options)
          : await ImagePicker.launchImageLibraryAsync(options);

      if (result.canceled || !result.assets?.length) return;

      const stored = persistHabitPhoto(result.assets[0].uri, habitId, dateKey);
      if (photoUri && photoUri !== originalPhotoUri) deleteHabitPhoto(photoUri);
      setPhotoUri(stored);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (error) {
      console.warn("Failed to pick check-in photo:", error);
      Alert.alert("Couldn't add photo", "Please try again.");
    }
  };

  const removePhoto = () => {
    if (photoUri && photoUri !== originalPhotoUri) deleteHabitPhoto(photoUri);
    setPhotoUri(null);
  };

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await onSubmit({ photoUri, note: note.trim() });
      // The replaced photo is only unreachable once the new one is persisted.
      if (originalPhotoUri && originalPhotoUri !== photoUri) {
        deleteHabitPhoto(originalPhotoUri);
      }
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const handleUndo = () => {
    Alert.alert(
      `Undo "${habitTitle}"?`,
      "Your photo and reflection for today will be deleted.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Undo check-in",
          style: "destructive",
          onPress: () => {
            if (photoUri && photoUri !== originalPhotoUri)
              deleteHabitPhoto(photoUri);
            onUndo?.();
            onClose();
          },
        },
      ],
    );
  };

  const s = makeStyles(C);

  return (
    <Host>
      <BottomSheet
        isPresented={visible}
        onDismiss={handleClose}
        snapPoints={["half", "full"]}
      >
        <RNHostView>
          <View style={s.sheet}>
            <View style={s.header}>
              <Pressable onPress={handleClose} style={s.headerBtn}>
                <Text style={s.cancelText}>Cancel</Text>
              </Pressable>
              <Text style={s.headerTitle} numberOfLines={1}>
                {habitTitle}
              </Text>
              <Pressable
                onPress={handleSave}
                style={[s.headerBtn, s.saveBtn]}
                disabled={saving}
                accessibilityRole="button"
                accessibilityLabel={
                  isDone ? "Save check-in" : "Mark habit done"
                }
              >
                <Text style={[s.saveText, saving && s.saveTextDisabled]}>
                  {isDone ? "Save" : "Done"}
                </Text>
              </Pressable>
            </View>

            <KeyboardAwareScrollView
              style={s.scroll}
              contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
              bottomOffset={32}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <Text style={s.intro}>
                {isDone
                  ? "Your check-in for today."
                  : "Add a photo and a note - both optional."}
              </Text>

              <View style={s.section}>
                <Text style={s.label}>PHOTO</Text>
                {photoUri ? (
                  <View style={s.photoWrap}>
                    <Image
                      source={{ uri: photoUri }}
                      style={s.photo}
                      resizeMode="cover"
                    />
                    <Pressable
                      style={s.photoRemoveBtn}
                      onPress={removePhoto}
                      hitSlop={10}
                      accessibilityRole="button"
                      accessibilityLabel="Remove photo"
                    >
                      <Ionicons name="close" size={16} color={C.textPrimary} />
                    </Pressable>
                  </View>
                ) : (
                  <View style={s.photoActions}>
                    <Pressable
                      style={s.photoBtn}
                      onPress={() => pickPhoto("camera")}
                      accessibilityRole="button"
                      accessibilityLabel="Take a photo"
                    >
                      <Ionicons
                        name="camera-outline"
                        size={20}
                        color={C.accentText}
                      />
                      <Text style={s.photoBtnText}>Camera</Text>
                    </Pressable>
                    <Pressable
                      style={s.photoBtn}
                      onPress={() => pickPhoto("library")}
                      accessibilityRole="button"
                      accessibilityLabel="Choose a photo from library"
                    >
                      <Ionicons
                        name="images-outline"
                        size={20}
                        color={C.accentText}
                      />
                      <Text style={s.photoBtnText}>Library</Text>
                    </Pressable>
                  </View>
                )}
              </View>

              <View style={s.section}>
                <Text style={s.label}>SELF-REFLECTION</Text>
                <TextInput
                  style={s.noteInput}
                  placeholder="How did it go? What did you notice?"
                  placeholderTextColor={C.textQuaternary}
                  value={note}
                  onChangeText={setNote}
                  multiline
                  maxLength={NOTE_MAX_LENGTH}
                />
                <Text style={s.counter}>
                  {note.length}/{NOTE_MAX_LENGTH}
                </Text>
              </View>

              {isDone && onUndo ? (
                <Pressable
                  style={s.undoBtn}
                  onPress={handleUndo}
                  accessibilityRole="button"
                  accessibilityLabel="Undo check-in"
                >
                  <Ionicons
                    name="arrow-undo-outline"
                    size={18}
                    color={C.textQuaternary}
                  />
                  <Text style={s.undoBtnText}>Undo check-in</Text>
                </Pressable>
              ) : null}
            </KeyboardAwareScrollView>
          </View>
        </RNHostView>
      </BottomSheet>
    </Host>
  );
}

function makeStyles(C: ReturnType<typeof useTheme>) {
  return StyleSheet.create({
    sheet: {
      flex: 1,
      backgroundColor: C.background,
      paddingHorizontal: 20,
      paddingTop: 12,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 20,
      gap: 12,
    },
    headerTitle: {
      flex: 1,
      textAlign: "center",
      fontSize: 16,
      fontWeight: "700",
      color: C.textPrimary,
    },
    headerBtn: { minWidth: 60 },
    cancelText: { fontSize: 15, color: C.textSecondary },
    saveBtn: { alignItems: "flex-end" },
    saveText: { fontSize: 15, fontWeight: "700", color: C.accentText },
    saveTextDisabled: { color: C.textQuaternary },
    scroll: { flex: 1 },
    intro: {
      fontSize: 13,
      color: C.textTertiary,
      marginBottom: 20,
    },
    section: { marginBottom: 24 },
    label: {
      fontSize: 11,
      fontWeight: "700",
      letterSpacing: 1.5,
      color: C.textTertiary,
      marginBottom: 10,
    },
    photoActions: { flexDirection: "row", gap: 10 },
    photoBtn: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      height: 52,
      borderRadius: 12,
      backgroundColor: C.accentBg,
      borderWidth: 1,
      borderColor: C.accentBorder,
    },
    photoBtnText: { fontSize: 14, fontWeight: "700", color: C.accentText },
    photoWrap: {
      borderRadius: 14,
      overflow: "hidden",
      borderWidth: 1,
      borderColor: C.cardBorder,
      backgroundColor: C.cardBg,
    },
    photo: { width: "100%", height: 240 },
    photoRemoveBtn: {
      position: "absolute",
      top: 10,
      right: 10,
      width: 30,
      height: 30,
      borderRadius: 15,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: C.overlayBg,
    },
    noteInput: {
      minHeight: 120,
      backgroundColor: C.cardBg,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: C.cardBorder,
      paddingHorizontal: 14,
      paddingVertical: 13,
      fontSize: 15,
      lineHeight: 21,
      color: C.textPrimary,
      textAlignVertical: "top",
    },
    counter: {
      marginTop: 6,
      alignSelf: "flex-end",
      fontSize: 11,
      color: C.textQuaternary,
    },
    undoBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      paddingVertical: 14,
    },
    undoBtnText: { fontSize: 14, fontWeight: "600", color: C.textQuaternary },
  });
}
