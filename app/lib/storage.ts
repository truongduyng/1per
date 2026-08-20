import { createMMKV } from "react-native-mmkv";

export const storage = createMMKV();

export const STORAGE_KEYS = {
  HABIT_REMINDER_ENABLED:   'reminder.habit.enabled',
  HABIT_REMINDER_HOUR:      'reminder.habit.hour',
  HABIT_REMINDER_MINUTE:    'reminder.habit.minute',
  HABIT_REMINDER_ID:        'reminder.habit.notifId',
  EVENING_REMINDER_ENABLED: 'reminder.evening.enabled',
  EVENING_REMINDER_HOUR:    'reminder.evening.hour',
  EVENING_REMINDER_MINUTE:  'reminder.evening.minute',
  EVENING_REMINDER_ID:      'reminder.evening.notifId',
  APP_LOCK_HOUR:            'appLock.hour',
  APP_LOCK_MINUTE:          'appLock.minute',
  APP_LOCK_CONDITION:       'appLock.condition',
  LAST_BACKUP_AT:           'sync.lastBackupAt',
} as const;

export type ReminderState = { enabled: boolean; hour: number; minute: number };
