import Constants from "expo-constants";
import * as StoreReview from "expo-store-review";
import React, { useState } from "react";
import {
  Alert,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { router, Stack } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import GradientBackground from "@/components/GradientBackground";
import { resetDatabase } from "@/lib/db";
import { insertAllScreenshotData } from "@/utils/generateTestData";
import { ThemePreference, useThemePreference } from "@/contexts/ThemeContext";
import { palette } from "@/constants/theme";
import { useTheme } from "@/hooks/useTheme";
import { useRevenueCat } from "@/hooks/useRevenueCat";
import { useReminderManager } from "@/hooks/useReminderManager";
import { appBlocker, type AppLockCondition } from "@/lib/appBlocker";
import { cancelAllNotifications } from "@/lib/notifications";
import { backupNow, getLastBackupAt, restoreNow } from "@/lib/cloudSync";

const THEME_OPTIONS: ThemePreference[] = ["system", "light", "dark"];
const LOCK_CONDITION_OPTIONS: { value: AppLockCondition; label: string }[] = [
  { value: "goal", label: "Main task only" },
  { value: "goal_and_habits", label: "Main task + habits" },
];
const PRIVACY_POLICY_URL = "https://yikudo.xyz/1per/privacy";
const TERMS_OF_SERVICE_URL = "https://yikudo.xyz/1per/terms";
const SHOW_SCREENSHOT_DATA_ACTION =
  __DEV__ || Constants.expoConfig?.extra?.enableScreenshotData === true;

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const C = useTheme();
  const version = Constants.expoConfig?.version ?? "1.0.0";
  const { preference, setPreference } = useThemePreference();
  const { hasActiveSubscription } = useRevenueCat();
  const [isResetting, setIsResetting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [lastBackupAt, setLastBackupAt] = useState(() => getLastBackupAt());

  const handleBackup = async () => {
    setIsSyncing(true);
    try {
      await backupNow();
      setLastBackupAt(getLastBackupAt());
      Alert.alert("Backup ready", "Your data is linked to your Apple account and will be available after reinstall.");
    } catch (error) {
      console.error("Failed to sync cloud data:", error);
      Alert.alert("Backup unavailable", "Please try again when you have an internet connection.");
    } finally {
      setIsSyncing(false);
    }
  };

  const handleRestore = () => {
    Alert.alert(
      "Restore from backup?",
      "This replaces all data on this device with your Apple account's cloud backup. This can't be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Restore",
          style: "destructive",
          onPress: async () => {
            setIsRestoring(true);
            try {
              await restoreNow();
              setLastBackupAt(getLastBackupAt());
              Alert.alert(
                "Data restored",
                "Restart 1Per to see your restored data.",
              );
            } catch (error) {
              console.error("Failed to restore cloud data:", error);
              Alert.alert(
                "Restore unavailable",
                "We couldn't find a backup for this Apple account, or you're offline. Please try again.",
              );
            } finally {
              setIsRestoring(false);
            }
          },
        },
      ],
    );
  };

  const lastBackupCopy = lastBackupAt
    ? `Last backup: ${lastBackupAt.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}`
    : "Sign in with Apple to keep your data after reinstalling.";

  const openExternalUrl = async (url: string) => {
    const supported = await Linking.canOpenURL(url);

    if (!supported) {
      Alert.alert("Unable to open link", "Please try again later.");
      return;
    }

    await Linking.openURL(url);
  };

  const handleRate = async () => {
    const available = await StoreReview.isAvailableAsync();

    if (!available) {
      Alert.alert(
        "Rating unavailable",
        "Store ratings are not available on this device.",
      );
      return;
    }

    await StoreReview.requestReview();
  };

  const handleReset = () => {
    Alert.alert(
      "Reset all data",
      "This will permanently delete your profile and habits.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Reset",
          style: "destructive",
          onPress: async () => {
            setIsResetting(true);
            try {
              await cancelAllNotifications();
              appBlocker.reset();
              await resetDatabase();
              router.replace("/onboarding");
            } catch (error) {
              console.error("Failed to reset app data:", error);
              Alert.alert(
                "Reset failed",
                "Your data could not be fully reset. Please try again.",
              );
            } finally {
              setIsResetting(false);
            }
          },
        },
      ],
    );
  };

  const handleGenerateScreenshotData = () => {
    Alert.alert(
      "Generate screenshot data",
      "This will replace local data with polished sample content for App Store screenshots.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Generate",
          onPress: async () => {
            await insertAllScreenshotData();
            router.replace("/");
          },
        },
      ],
    );
  };

  const {
    habitState,
    eveningState,
    isUpdating,
    toggleHabitReminder,
    toggleEveningReminder,
  } = useReminderManager();

  const [appLockTime, setAppLockTime] = useState(() =>
    appBlocker.getDailyLockTime(),
  );
  const [isUpdatingAppLockTime, setIsUpdatingAppLockTime] = useState(false);
  const [lockCondition, setLockCondition] = useState(() =>
    appBlocker.getLockCondition(),
  );

  const [pickerTarget, setPickerTarget] = useState<
    "habit" | "evening" | "appLock" | null
  >(null);
  const [draftDate, setDraftDate] = useState(new Date());

  const openPicker = (target: "habit" | "evening" | "appLock") => {
    const state =
      target === "habit"
        ? habitState
        : target === "evening"
          ? eveningState
          : appLockTime;
    const d = new Date();
    d.setHours(state.hour, state.minute, 0, 0);
    setDraftDate(d);
    setPickerTarget(target);
  };

  const commitAppLockTime = async (hour: number, minute: number) => {
    setIsUpdatingAppLockTime(true);
    try {
      await appBlocker.setDailyLockTime(hour, minute);
      setAppLockTime({ hour, minute });
    } finally {
      setIsUpdatingAppLockTime(false);
    }
  };

  const onPickerChange = (_event: any, selected?: Date) => {
    if (Platform.OS === "android") setPickerTarget(null);
    if (!selected) return;
    setDraftDate(selected);
    if (Platform.OS === "android") {
      if (pickerTarget === "appLock") {
        commitAppLockTime(selected.getHours(), selected.getMinutes());
      } else {
        const isHabit = pickerTarget === "habit";
        const state = isHabit ? habitState : eveningState;
        const toggle = isHabit ? toggleHabitReminder : toggleEveningReminder;
        toggle(state.enabled, selected.getHours(), selected.getMinutes());
      }
    }
  };

  const commitPicker = () => {
    if (!pickerTarget) return;
    if (pickerTarget === "appLock") {
      commitAppLockTime(draftDate.getHours(), draftDate.getMinutes());
    } else {
      const isHabit = pickerTarget === "habit";
      const state = isHabit ? habitState : eveningState;
      const toggle = isHabit ? toggleHabitReminder : toggleEveningReminder;
      toggle(state.enabled, draftDate.getHours(), draftDate.getMinutes());
    }
    setPickerTarget(null);
  };

  const formatTime = (hour: number, minute: number) => {
    const ampm = hour >= 12 ? "PM" : "AM";
    const h = hour % 12 || 12;
    const m = minute.toString().padStart(2, "0");
    return `${h}:${m} ${ampm}`;
  };

  const s = makeStyles(C, insets);
  const reminderSwitchTrackColor = {
    false: C.cardBorder,
    true: palette.orange,
  };
  const reminderSwitchThumbColor =
    Platform.OS === "android" ? C.cardBg : undefined;

  return (
    <View style={s.container}>
      <GradientBackground />
      <Stack.Screen
        options={{
          title: "Settings",
          headerShown: true,
          headerStyle: { backgroundColor: C.screenBg },
          headerTintColor: C.textPrimary,
          headerTitleStyle: { color: C.textPrimary },
          headerShadowVisible: false,
        }}
      />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{
          paddingTop: 16,
          paddingBottom: insets.bottom + 40,
          paddingHorizontal: 20,
          gap: 18,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View style={s.section}>
          <Text selectable style={s.sectionLabel}>
            Appearance
          </Text>
          <View style={s.card}>
            <Text selectable style={s.cardTitle}>
              Theme
            </Text>
            <Text selectable style={s.cardCopy}>
              Choose whether 1Per follows the system or stays fixed.
            </Text>

            <View style={s.segmentRow}>
              {THEME_OPTIONS.map((option) => {
                const active = preference === option;
                return (
                  <Pressable
                    key={option}
                    style={[s.segmentButton, active && s.segmentButtonActive]}
                    onPress={() => setPreference(option)}
                  >
                    <Text
                      selectable
                      style={[s.segmentLabel, active && s.segmentLabelActive]}
                    >
                      {option.charAt(0).toUpperCase() + option.slice(1)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </View>

        <View style={s.section}>
          <Text selectable style={s.sectionLabel}>
            Notifications
          </Text>
          <View style={s.listCard}>
            <View style={s.listRow}>
              <Text selectable style={s.rowLabel}>
                Daily habit check-in
              </Text>
              <Switch
                value={habitState.enabled}
                onValueChange={(val) =>
                  toggleHabitReminder(val, habitState.hour, habitState.minute)
                }
                disabled={isUpdating}
                trackColor={reminderSwitchTrackColor}
                thumbColor={reminderSwitchThumbColor}
                ios_backgroundColor={C.cardBorder}
              />
            </View>
            {habitState.enabled && (
              <>
                <View style={s.divider} />
                <Pressable
                  style={s.listRow}
                  onPress={() => openPicker("habit")}
                >
                  <Text
                    selectable
                    style={[s.rowLabel, { color: C.textSecondary }]}
                  >
                    Reminder time
                  </Text>
                  <Text
                    selectable
                    style={[s.rowValue, { color: palette.orange }]}
                  >
                    {formatTime(habitState.hour, habitState.minute)}
                  </Text>
                </Pressable>
              </>
            )}
            <View style={s.divider} />
            <View style={s.listRow}>
              <Text selectable style={s.rowLabel}>
                Evening reset
              </Text>
              <Switch
                value={eveningState.enabled}
                onValueChange={(val) =>
                  toggleEveningReminder(
                    val,
                    eveningState.hour,
                    eveningState.minute,
                  )
                }
                disabled={isUpdating}
                trackColor={reminderSwitchTrackColor}
                thumbColor={reminderSwitchThumbColor}
                ios_backgroundColor={C.cardBorder}
              />
            </View>
            {eveningState.enabled && (
              <>
                <View style={s.divider} />
                <Pressable
                  style={s.listRow}
                  onPress={() => openPicker("evening")}
                >
                  <Text
                    selectable
                    style={[s.rowLabel, { color: C.textSecondary }]}
                  >
                    Reminder time
                  </Text>
                  <Text
                    selectable
                    style={[s.rowValue, { color: palette.orange }]}
                  >
                    {formatTime(eveningState.hour, eveningState.minute)}
                  </Text>
                </Pressable>
              </>
            )}
          </View>
        </View>

        {appBlocker.isSupported && (
          <View style={s.section}>
            <Text selectable style={s.sectionLabel}>
              App Lock
            </Text>
            <View style={s.card}>
              <Text selectable style={s.cardTitle}>
                Unlock condition
              </Text>
              <Text selectable style={s.cardCopy}>
                Choose what needs to be done today before blocked apps unlock.
              </Text>
              <View style={s.segmentRow}>
                {LOCK_CONDITION_OPTIONS.map((option) => {
                  const active = lockCondition === option.value;
                  return (
                    <Pressable
                      key={option.value}
                      style={[s.segmentButton, active && s.segmentButtonActive]}
                      onPress={() => {
                        appBlocker.setLockCondition(option.value);
                        setLockCondition(option.value);
                      }}
                    >
                      <Text
                        selectable
                        style={[s.segmentLabel, active && s.segmentLabelActive]}
                      >
                        {option.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
            <View style={s.listCard}>
              <Pressable
                style={s.listRow}
                onPress={() => openPicker("appLock")}
                disabled={isUpdatingAppLockTime}
              >
                <Text selectable style={s.rowLabel}>
                  Daily reset time
                </Text>
                <Text
                  selectable
                  style={[s.rowValue, { color: palette.orange }]}
                >
                  {formatTime(appLockTime.hour, appLockTime.minute)}
                </Text>
              </Pressable>
            </View>
          </View>
        )}

        <View style={s.section}>
          <Text selectable style={s.sectionLabel}>
            App
          </Text>
          <View style={s.listCard}>
            <Pressable
              style={s.actionRow}
              onPress={() =>
                openExternalUrl("https://apps.apple.com/account/subscriptions")
              }
            >
              <Text selectable style={s.rowLabel}>
                {hasActiveSubscription()
                  ? "Manage Subscription"
                  : "Subscribe to Pro"}
              </Text>
              <Text selectable style={s.chevron}>
                ›
              </Text>
            </Pressable>
            <View style={s.divider} />
            <Pressable
              style={s.actionRow}
              onPress={() => openExternalUrl(PRIVACY_POLICY_URL)}
            >
              <Text selectable style={s.rowLabel}>
                Privacy Policy
              </Text>
              <Text selectable style={s.chevron}>
                ›
              </Text>
            </Pressable>
            <View style={s.divider} />
            <Pressable
              style={s.actionRow}
              onPress={() => openExternalUrl(TERMS_OF_SERVICE_URL)}
            >
              <Text selectable style={s.rowLabel}>
                Terms of Service
              </Text>
              <Text selectable style={s.chevron}>
                ›
              </Text>
            </Pressable>
            <View style={s.divider} />
            <Pressable style={s.actionRow} onPress={handleRate}>
              <Text selectable style={s.rowLabel}>
                Rate 1Per
              </Text>
              <Text selectable style={s.chevron}>
                ›
              </Text>
            </Pressable>
            <View style={s.divider} />
            <View style={s.listRow}>
              <Text selectable style={s.rowLabel}>
                Version
              </Text>
              <Text selectable style={s.rowValue}>
                {version}
              </Text>
            </View>
            <View style={s.divider} />
          </View>
        </View>

        <View style={s.section}>
          <Text selectable style={s.sectionLabel}>
            Data
          </Text>
          <View style={s.listCard}>
            <Pressable style={s.actionRow} onPress={handleBackup} disabled={isSyncing}>
              <View style={s.actionTextBlock}>
                <Text selectable style={s.rowLabel}>{isSyncing ? "Backing up…" : "Back up data"}</Text>
                <Text selectable style={s.rowCopy}>
                  {lastBackupCopy}
                </Text>
              </View>
              <Text selectable style={s.chevron}>›</Text>
            </Pressable>
            <View style={s.divider} />
            <Pressable style={s.actionRow} onPress={handleRestore} disabled={isRestoring}>
              <View style={s.actionTextBlock}>
                <Text selectable style={s.rowLabel}>{isRestoring ? "Restoring…" : "Restore from backup"}</Text>
                <Text selectable style={s.rowCopy}>
                  Replace this device's data with your Apple account's cloud backup.
                </Text>
              </View>
              <Text selectable style={s.chevron}>›</Text>
            </Pressable>
            <View style={s.divider} />
            <Pressable
              style={s.actionRow}
              onPress={handleReset}
              disabled={isResetting}
            >
              <View style={s.actionTextBlock}>
                <Text selectable style={s.dangerLabel}>
                  {isResetting ? "Resetting…" : "Reset all data"}
                </Text>
                <Text selectable style={s.dangerCopy}>
                  Start over from onboarding and clear the local database.
                </Text>
              </View>
              <Text selectable style={s.chevron}>
                ›
              </Text>
            </Pressable>
            {SHOW_SCREENSHOT_DATA_ACTION ? (
              <>
                <View style={s.divider} />
                <Pressable
                  style={s.actionRow}
                  onPress={handleGenerateScreenshotData}
                >
                  <View style={s.actionTextBlock}>
                    <Text selectable style={s.rowLabel}>
                      Generate screenshot data
                    </Text>
                    <Text selectable style={s.rowCopy}>
                      Fill 1Per with sample habits, tasks, and progress.
                    </Text>
                  </View>
                  <Text selectable style={s.chevron}>
                    ›
                  </Text>
                </Pressable>
              </>
            ) : null}
          </View>
        </View>
      </ScrollView>

      {pickerTarget !== null && Platform.OS === "ios" && (
        <Modal
          transparent
          animationType="slide"
          visible
          onRequestClose={() => setPickerTarget(null)}
        >
          <View style={s.pickerOverlay}>
            <Pressable
              style={StyleSheet.absoluteFill}
              onPress={() => setPickerTarget(null)}
            />
            <View style={s.pickerSheet}>
              <View style={s.pickerHeader}>
                <Pressable onPress={() => setPickerTarget(null)}>
                  <Text
                    selectable
                    style={[s.pickerBtn, { color: C.textSecondary }]}
                  >
                    Cancel
                  </Text>
                </Pressable>
                <Pressable onPress={commitPicker}>
                  <Text
                    selectable
                    style={[s.pickerBtn, { color: palette.orange }]}
                  >
                    Done
                  </Text>
                </Pressable>
              </View>
              <View style={s.pickerBody}>
                <DateTimePicker
                  value={draftDate}
                  mode="time"
                  display="spinner"
                  onChange={onPickerChange}
                  textColor={C.textPrimary}
                  style={{ width: "100%" }}
                />
              </View>
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}

function makeStyles(
  C: ReturnType<typeof import("@/hooks/useTheme").useTheme>,
  insets: { bottom: number },
) {
  return StyleSheet.create({
    container: { flex: 1 },
    section: { gap: 10 },
    sectionLabel: {
      color: C.textTertiary,
      fontSize: 12,
      fontWeight: "700",
      letterSpacing: 1.5,
      textTransform: "uppercase",
    },
    card: {
      borderRadius: 24,
      borderCurve: "continuous",
      backgroundColor: C.cardBg,
      borderWidth: 1,
      borderColor: C.cardBorder,
      padding: 18,
      gap: 14,
    },
    cardTitle: {
      color: C.textPrimary,
      fontSize: 18,
      fontWeight: "700",
    },
    cardCopy: {
      color: C.textSecondary,
      fontSize: 14,
      lineHeight: 20,
    },
    segmentRow: {
      flexDirection: "row",
      gap: 10,
    },
    segmentButton: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 12,
      borderRadius: 16,
      borderCurve: "continuous",
      backgroundColor: C.cardBg,
      borderWidth: 1,
      borderColor: C.cardBorder,
    },
    segmentButtonActive: {
      backgroundColor: C.accentBg,
      borderColor: C.accentBorder,
    },
    segmentLabel: {
      color: C.textSecondary,
      fontSize: 14,
      fontWeight: "700",
    },
    segmentLabelActive: {
      color: palette.orange,
    },
    listCard: {
      borderRadius: 24,
      borderCurve: "continuous",
      backgroundColor: C.cardBg,
      borderWidth: 1,
      borderColor: C.cardBorder,
      overflow: "hidden",
    },
    listRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      paddingVertical: 16,
    },
    rowLabel: {
      color: C.textPrimary,
      fontSize: 15,
      fontWeight: "500",
    },
    rowValue: {
      color: C.textSecondary,
      fontSize: 14,
      fontWeight: "700",
    },
    rowCopy: {
      color: C.textSecondary,
      fontSize: 13,
      lineHeight: 18,
    },
    divider: {
      height: 1,
      backgroundColor: C.divider,
    },
    actionRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
      paddingHorizontal: 16,
      paddingVertical: 16,
    },
    actionTextBlock: {
      flex: 1,
      gap: 4,
    },
    dangerLabel: {
      color: "#FF7B7B",
      fontSize: 15,
      fontWeight: "700",
    },
    dangerCopy: {
      color: C.textSecondary,
      fontSize: 13,
      lineHeight: 18,
    },
    chevron: {
      color: C.textTertiary,
      fontSize: 22,
    },
    pickerOverlay: {
      flex: 1,
      justifyContent: "flex-end" as const,
      backgroundColor: "rgba(0,0,0,0.4)",
    },
    pickerSheet: {
      backgroundColor: C.sheetBg,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      borderCurve: "continuous" as const,
      overflow: "hidden" as const,
      paddingBottom: insets.bottom + 16,
    },
    pickerHeader: {
      flexDirection: "row" as const,
      justifyContent: "space-between" as const,
      paddingHorizontal: 20,
      paddingVertical: 14,
      borderBottomWidth: 1,
      borderBottomColor: C.divider,
    },
    pickerBtn: {
      fontSize: 16,
      fontWeight: "600" as const,
    },
    pickerBody: {
      alignItems: "center" as const,
      justifyContent: "center" as const,
      paddingVertical: 8,
    },
  });
}
