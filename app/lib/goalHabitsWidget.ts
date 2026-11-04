import { ExtensionStorage } from "@kingstinct/expo-apple-targets";

export const GOAL_HABITS_WIDGET_KIND = "GoalHabitsWidget";
// Also reads goalHabitsSnapshot, laid out as a timeline of today.
export const TODAY_TIMELINE_WIDGET_KIND = "TodayTimelineWidget";
export const GOAL_HABITS_APP_GROUP = "group.app.kadoze.yikudo";
export const GOAL_HABITS_WIDGET_STORAGE_KEY = "goalHabitsSnapshot";
// Written by the widget's ToggleHabitDoneIntent (tap-to-complete on the
// habit row) since the widget extension can't reach the app's SQLite
// database directly. The app reconciles these ids into completionOps and
// clears the list next time it comes to the foreground.
export const PENDING_HABIT_TOGGLES_KEY = "pendingHabitToggles";

export type GoalHabitsWidgetHabit = {
  id: number;
  title: string;
  done: boolean;
  // Unix ms when the habit was checked off - places it on the timeline.
  doneAt: number | null;
};

export type GoalHabitsSnapshot = {
  date: string;
  goalText: string;
  goalDone: boolean;
  habits: GoalHabitsWidgetHabit[];
  goalDoneAt: number | null;
  focusMinutes: number;
  eveningResetDoneAt: number | null;
};

export function syncGoalHabitsWidget(snapshot: GoalHabitsSnapshot) {
  const extensionStorage = new ExtensionStorage(GOAL_HABITS_APP_GROUP);
  // ExtensionStorage.set()'s type only declares flat string/number records,
  // but it JSON-encodes whatever object it's given (see the matching comment
  // in GoalHabitsWidget.swift), so nested arrays/booleans work fine at runtime.
  extensionStorage.set(
    GOAL_HABITS_WIDGET_STORAGE_KEY,
    snapshot as unknown as Record<string, string | number>,
  );
  ExtensionStorage.reloadWidget(GOAL_HABITS_WIDGET_KIND);
  ExtensionStorage.reloadWidget(TODAY_TIMELINE_WIDGET_KIND);
}

/** Habit ids tapped in the widget since the app last reconciled them. */
export function readPendingHabitToggles(): number[] {
  const extensionStorage = new ExtensionStorage(GOAL_HABITS_APP_GROUP);
  const raw = extensionStorage.get(PENDING_HABIT_TOGGLES_KEY);
  return Array.isArray(raw) ? (raw as number[]) : [];
}

export function clearPendingHabitToggles() {
  const extensionStorage = new ExtensionStorage(GOAL_HABITS_APP_GROUP);
  extensionStorage.set(
    PENDING_HABIT_TOGGLES_KEY,
    [] as unknown as Record<string, string | number>,
  );
}
