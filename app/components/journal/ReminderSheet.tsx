import { useTheme } from "@/hooks/useTheme";
import { reminderPresets } from "@/lib/journalActions";
import { formatReminder } from "@/lib/journal";
import { Ionicons } from "@expo/vector-icons";
import DateTimePicker, { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import { useNow } from "@/hooks/useNow";
import React, { useState } from "react";
import { Modal, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

interface Props {
  visible: boolean;
  current: Date | null;
  onClose: () => void;
  /** null removes the reminder. */
  onPick: (date: Date | null) => void;
}

function defaultCustomDate() {
  const d = new Date(Date.now() + 2 * 60 * 60 * 1000);
  d.setMinutes(0, 0, 0);
  return d;
}

export function ReminderSheet(props: Props) {
  // Content mounts fresh on each open so its draft state starts from `current`.
  return (
    <Modal visible={props.visible} transparent animationType="slide" onRequestClose={props.onClose}>
      {props.visible ? <SheetContent {...props} /> : null}
    </Modal>
  );
}

function SheetContent({ current, onClose, onPick }: Props) {
  const C = useTheme();
  const insets = useSafeAreaInsets();
  const now = useNow(15_000);
  const [custom, setCustom] = useState<Date>(() =>
    current && current.getTime() > Date.now() ? current : defaultCustomDate(),
  );
  const [showCustom, setShowCustom] = useState(false);
  const s = makeStyles(C);

  const openCustom = () => {
    if (Platform.OS !== "android") {
      setShowCustom(true);
      return;
    }
    // Android has no combined date+time picker: ask for the date, then the time.
    DateTimePickerAndroid.open({
      value: custom,
      mode: "date",
      minimumDate: new Date(),
      onChange: (event, date) => {
        if (event.type !== "set" || !date) return;
        DateTimePickerAndroid.open({
          value: date,
          mode: "time",
          onChange: (timeEvent, time) => {
            if (timeEvent.type === "set" && time) onPick(time);
          },
        });
      },
    });
  };

  const customIsValid = custom.getTime() > now;

  return (
    <>
      <Pressable style={s.backdrop} onPress={onClose} accessibilityLabel="Close" />
      <View style={[s.sheet, { paddingBottom: insets.bottom + 16 }]}>
        <View style={s.handle} />
        <Text style={s.title}>Remind me</Text>
        {current ? (
          <Text style={s.subtitle}>Currently: {formatReminder(current)}</Text>
        ) : null}

        {showCustom ? (
          <>
            <DateTimePicker
              value={custom}
              mode="datetime"
              display="spinner"
              minimumDate={new Date()}
              onChange={(_, date) => date && setCustom(date)}
              textColor={C.textPrimary}
              style={{ width: "100%" }}
            />
            <Pressable
              style={[s.primaryBtn, !customIsValid && s.disabled]}
              disabled={!customIsValid}
              onPress={() => onPick(custom)}
              accessibilityRole="button"
            >
              <Text style={s.primaryBtnText}>Set for {formatReminder(custom)}</Text>
            </Pressable>
          </>
        ) : (
          <View style={s.options}>
            {reminderPresets().map((preset) => (
              <Pressable
                key={preset.label}
                style={s.option}
                onPress={() => onPick(preset.date)}
                accessibilityRole="button"
              >
                <Ionicons name="alarm-outline" size={18} color={C.accentText} />
                <Text style={s.optionText}>{preset.label}</Text>
                <Text style={s.optionMeta}>{formatReminder(preset.date)}</Text>
              </Pressable>
            ))}
            <Pressable style={s.option} onPress={openCustom} accessibilityRole="button">
              <Ionicons name="calendar-outline" size={18} color={C.accentText} />
              <Text style={s.optionText}>Pick date & time…</Text>
            </Pressable>
            {current ? (
              <Pressable style={s.option} onPress={() => onPick(null)} accessibilityRole="button">
                <Ionicons name="notifications-off-outline" size={18} color={C.textTertiary} />
                <Text style={[s.optionText, { color: C.textTertiary }]}>Remove reminder</Text>
              </Pressable>
            ) : null}
          </View>
        )}
      </View>
    </>
  );
}

function makeStyles(C: ReturnType<typeof useTheme>) {
  return StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: C.overlayBg },
    sheet: {
      backgroundColor: C.sheetBg,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      paddingHorizontal: 20,
      paddingTop: 10,
    },
    handle: {
      alignSelf: "center",
      width: 40,
      height: 5,
      borderRadius: 3,
      backgroundColor: C.sheetHandle,
      marginBottom: 14,
    },
    title: { fontSize: 17, fontWeight: "700", color: C.textPrimary },
    subtitle: { fontSize: 13, color: C.textTertiary, marginTop: 4 },
    options: { marginTop: 14, gap: 8 },
    option: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      height: 50,
      paddingHorizontal: 14,
      borderRadius: 12,
      backgroundColor: C.cardBg,
      borderWidth: 1,
      borderColor: C.cardBorder,
    },
    optionText: { flex: 1, fontSize: 15, fontWeight: "600", color: C.textPrimary },
    optionMeta: { fontSize: 12, color: C.textTertiary },
    primaryBtn: {
      height: 50,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: C.accent,
      marginTop: 8,
    },
    primaryBtnText: { fontSize: 15, fontWeight: "700", color: C.textInverse },
    disabled: { opacity: 0.5 },
  });
}
