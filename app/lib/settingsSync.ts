import { storage, STORAGE_KEYS } from "./storage";
import {
  cancelNotification,
  hasNotificationPermissionAsync,
  scheduleRepeatingNotification,
} from "./notifications";

const THEME_PREFERENCE_KEY = "theme_preference";

type ReminderSetting = { enabled: boolean; hour: number; minute: number };

export type SettingsSnapshot = {
  themePreference?: string;
  habitReminder?: ReminderSetting;
  eveningReminder?: ReminderSetting;
  appLock?: { hour: number; minute: number; condition: string };
};

// Only preferences a user would expect to carry over to a new device -
// notification/activity IDs are device-specific and never included.
export function exportSettingsSnapshot(): SettingsSnapshot {
  const snapshot: SettingsSnapshot = {};

  const theme = storage.getString(THEME_PREFERENCE_KEY);
  if (theme) snapshot.themePreference = theme;

  if (storage.contains(STORAGE_KEYS.HABIT_REMINDER_ENABLED)) {
    snapshot.habitReminder = {
      enabled: storage.getBoolean(STORAGE_KEYS.HABIT_REMINDER_ENABLED) ?? false,
      hour: storage.getNumber(STORAGE_KEYS.HABIT_REMINDER_HOUR) ?? 9,
      minute: storage.getNumber(STORAGE_KEYS.HABIT_REMINDER_MINUTE) ?? 0,
    };
  }

  if (storage.contains(STORAGE_KEYS.EVENING_REMINDER_ENABLED)) {
    snapshot.eveningReminder = {
      enabled: storage.getBoolean(STORAGE_KEYS.EVENING_REMINDER_ENABLED) ?? false,
      hour: storage.getNumber(STORAGE_KEYS.EVENING_REMINDER_HOUR) ?? 21,
      minute: storage.getNumber(STORAGE_KEYS.EVENING_REMINDER_MINUTE) ?? 0,
    };
  }

  if (
    storage.contains(STORAGE_KEYS.APP_LOCK_HOUR) ||
    storage.contains(STORAGE_KEYS.APP_LOCK_CONDITION)
  ) {
    snapshot.appLock = {
      hour: storage.getNumber(STORAGE_KEYS.APP_LOCK_HOUR) ?? 0,
      minute: storage.getNumber(STORAGE_KEYS.APP_LOCK_MINUTE) ?? 0,
      condition: storage.getString(STORAGE_KEYS.APP_LOCK_CONDITION) ?? "goal_and_habits",
    };
  }

  return snapshot;
}

async function rescheduleReminder(
  idKey: string,
  enabledKey: string,
  hourKey: string,
  minuteKey: string,
  setting: ReminderSetting,
  title: string,
  body: string,
) {
  const existingId = storage.getString(idKey);
  if (existingId) {
    await cancelNotification(existingId).catch(() => {});
    storage.remove(idKey);
  }

  storage.set(enabledKey, setting.enabled);
  storage.set(hourKey, setting.hour);
  storage.set(minuteKey, setting.minute);
  if (!setting.enabled) return;

  try {
    // Matches the app's existing convention of only auto-scheduling when
    // permission was already granted, never prompting on the user's behalf.
    const hasPermission = await hasNotificationPermissionAsync();
    if (!hasPermission) return;
    const id = await scheduleRepeatingNotification(title, body, setting.hour, setting.minute);
    storage.set(idKey, id);
  } catch (error) {
    console.warn("Failed to reschedule reminder after restore:", error);
  }
}

// Applies restored preferences to MMKV and, where the preference drives an
// OS-level side effect (a scheduled local notification), re-applies that
// side effect too - notification IDs from the old device are meaningless here.
export async function importSettingsSnapshot(snapshot: SettingsSnapshot | undefined) {
  if (!snapshot) return;

  if (snapshot.themePreference) {
    storage.set(THEME_PREFERENCE_KEY, snapshot.themePreference);
  }

  if (snapshot.appLock) {
    storage.set(STORAGE_KEYS.APP_LOCK_HOUR, snapshot.appLock.hour);
    storage.set(STORAGE_KEYS.APP_LOCK_MINUTE, snapshot.appLock.minute);
    storage.set(STORAGE_KEYS.APP_LOCK_CONDITION, snapshot.appLock.condition);
  }

  if (snapshot.habitReminder) {
    await rescheduleReminder(
      STORAGE_KEYS.HABIT_REMINDER_ID,
      STORAGE_KEYS.HABIT_REMINDER_ENABLED,
      STORAGE_KEYS.HABIT_REMINDER_HOUR,
      STORAGE_KEYS.HABIT_REMINDER_MINUTE,
      snapshot.habitReminder,
      "Don't break the streak",
      "A couple minutes is all it takes - knock out today's habits.",
    );
  }

  if (snapshot.eveningReminder) {
    await rescheduleReminder(
      STORAGE_KEYS.EVENING_REMINDER_ID,
      STORAGE_KEYS.EVENING_REMINDER_ENABLED,
      STORAGE_KEYS.EVENING_REMINDER_HOUR,
      STORAGE_KEYS.EVENING_REMINDER_MINUTE,
      snapshot.eveningReminder,
      "Day's done - reset time",
      "Wrap up today and set tomorrow up right. Open 1Per for your evening reset.",
    );
  }
}
