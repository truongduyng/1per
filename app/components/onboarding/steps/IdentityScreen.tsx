import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import React, { useState } from "react";
import { Alert, Image, Keyboard, Pressable, Text, TextInput, View } from "react-native";

import { palette } from "@/constants/theme";
import { persistAvatarPhoto } from "@/lib/avatarPhoto";
import { useTheme } from "@/hooks/useTheme";
import { ScreenShell } from "./shared";
import { ORANGE, makeStyles } from "./theme";

export function IdentityScreen({
  name,
  avatar,
  onNameChange,
  onAvatarChange,
  onNext,
}: {
  name: string;
  avatar: string | null;
  onNameChange: (name: string) => void;
  onAvatarChange: (avatar: string | null) => void;
  onNext: () => void;
}) {
  const C = useTheme();
  const s = makeStyles(C);
  const [isPicking, setIsPicking] = useState(false);
  const canContinue = name.trim().length > 0;

  const pickPhoto = async () => {
    try {
      setIsPicking(true);
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          "Photo access needed",
          "Enable photo access in Settings to add a profile picture.",
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7,
      });

      if (result.canceled || !result.assets?.length) return;

      const stored = persistAvatarPhoto(result.assets[0].uri);
      onAvatarChange(stored);
    } catch (error) {
      console.warn("Failed to pick avatar photo:", error);
      Alert.alert("Couldn't add photo", "Please try again.");
    } finally {
      setIsPicking(false);
    }
  };

  return (
    <ScreenShell
      onNext={onNext}
      disabled={!canContinue}
      scroll
      stickyFooter
      dismissesKeyboard
    >
      <View style={s.copyBlock}>
        <Text style={s.headline}>Make 1Per yours</Text>
        <Text style={s.body}>Add a photo and tell us what to call you</Text>
      </View>

      <View style={s.avatarPickerWrap}>
        <Pressable
          onPress={pickPhoto}
          disabled={isPicking}
          style={s.avatarPickerFrame}
        >
          {avatar ? (
            <Image source={{ uri: avatar }} style={s.avatarPickerImage} />
          ) : (
            <Ionicons name="person-outline" size={36} color={palette.white35} />
          )}
          <View style={s.avatarPickerBadge}>
            <Ionicons name="camera" size={14} color="#050505" />
          </View>
        </Pressable>
        <Text style={s.avatarPickerLabel}>
          {avatar ? "Tap to change photo" : "Add a photo (optional)"}
        </Text>
      </View>

      <View style={s.nameFieldWrap}>
        <Text style={s.fieldLabel}>Your name</Text>
        <TextInput
          value={name}
          onChangeText={onNameChange}
          placeholder="What should we call you?"
          placeholderTextColor={palette.white35}
          style={s.nameInput}
          selectionColor={ORANGE}
          maxLength={32}
          returnKeyType="done"
          onSubmitEditing={() => Keyboard.dismiss()}
        />
      </View>
    </ScreenShell>
  );
}
