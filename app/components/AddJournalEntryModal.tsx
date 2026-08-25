import { useTheme } from "@/hooks/useTheme";
import { deleteJournalPhoto, persistJournalPhoto } from "@/lib/journalPhotos";
import { getLocalDateString } from "@/lib/timezone";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import React, { useState } from "react";
import {
  Alert,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const NOTE_MAX_LENGTH = 500;

interface Props {
  visible: boolean;
  onClose: () => void;
  onSave: (draft: { note: string; photoUri: string | null }) => Promise<void>;
}

export function AddJournalEntryModal({ visible, onClose, onSave }: Props) {
  const C = useTheme();
  const insets = useSafeAreaInsets();
  const [note, setNote] = useState("");
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setNote("");
    setPhotoUri(null);
  };

  const handleClose = () => {
    if (photoUri) deleteJournalPhoto(photoUri);
    reset();
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
          "Enable access in Settings to attach a photo to your entry.",
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

      const stored = persistJournalPhoto(
        result.assets[0].uri,
        getLocalDateString(new Date()),
      );
      if (photoUri) deleteJournalPhoto(photoUri);
      setPhotoUri(stored);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (error) {
      console.warn("Failed to pick journal photo:", error);
      Alert.alert("Couldn't add photo", "Please try again.");
    }
  };

  const removePhoto = () => {
    if (photoUri) deleteJournalPhoto(photoUri);
    setPhotoUri(null);
  };

  const canSave = note.trim().length > 0 || !!photoUri;

  const handleSave = async () => {
    if (!canSave || saving) return;
    setSaving(true);
    try {
      await onSave({ note: note.trim(), photoUri });
      reset();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const s = makeStyles(C);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <View style={s.sheet}>
        <View style={s.header}>
          <Pressable
            onPress={handleClose}
            style={s.iconBtn}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Cancel"
          >
            <Ionicons name="close" size={20} color={C.textSecondary} />
          </Pressable>
          <Text style={s.headerTitle} numberOfLines={1}>
            New Entry
          </Text>
          <Pressable
            onPress={handleSave}
            style={[s.iconBtn, s.saveIconBtn, (!canSave || saving) && s.saveIconBtnDisabled]}
            disabled={!canSave || saving}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Save entry"
          >
            <Ionicons
              name="checkmark"
              size={20}
              color={!canSave || saving ? C.textQuaternary : C.accentText}
            />
          </Pressable>
        </View>

        <KeyboardAwareScrollView
          style={s.scroll}
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
          bottomOffset={32}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={s.section}>
            <Text style={s.label}>NOTE</Text>
            <TextInput
              style={s.noteInput}
              placeholder="What's on your mind today?"
              placeholderTextColor={C.textQuaternary}
              value={note}
              onChangeText={setNote}
              multiline
              maxLength={NOTE_MAX_LENGTH}
              autoFocus
            />
            <Text style={s.counter}>
              {note.length}/{NOTE_MAX_LENGTH}
            </Text>
          </View>

          <View style={s.section}>
            <Text style={s.label}>PHOTO (OPTIONAL)</Text>
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
                  <Ionicons name="camera-outline" size={20} color={C.accentText} />
                  <Text style={s.photoBtnText}>Camera</Text>
                </Pressable>
                <Pressable
                  style={s.photoBtn}
                  onPress={() => pickPhoto("library")}
                  accessibilityRole="button"
                  accessibilityLabel="Choose a photo from library"
                >
                  <Ionicons name="images-outline" size={20} color={C.accentText} />
                  <Text style={s.photoBtnText}>Library</Text>
                </Pressable>
              </View>
            )}
          </View>
        </KeyboardAwareScrollView>
      </View>
    </Modal>
  );
}

function makeStyles(C: ReturnType<typeof useTheme>) {
  return StyleSheet.create({
    sheet: { flex: 1, backgroundColor: C.background, paddingHorizontal: 20, paddingTop: 12 },
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
    iconBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: C.cardBg,
      borderWidth: 1,
      borderColor: C.cardBorder,
    },
    saveIconBtn: { backgroundColor: C.accentBg, borderColor: C.accentBorder },
    saveIconBtnDisabled: { opacity: 0.5 },
    scroll: { flex: 1 },
    section: { marginBottom: 24 },
    label: {
      fontSize: 11,
      fontWeight: "700",
      letterSpacing: 1.5,
      color: C.textTertiary,
      marginBottom: 10,
    },
    noteInput: {
      minHeight: 140,
      backgroundColor: C.cardBg,
      borderRadius: 12,
      borderCurve: "continuous",
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
  });
}
