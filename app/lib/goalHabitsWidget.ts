import { ExtensionStorage } from "@kingstinct/expo-apple-targets";

export const GOAL_HABITS_WIDGET_KIND = "GoalHabitsWidget";
export const GOAL_HABITS_APP_GROUP = "group.app.kadoze.yikudo";
export const GOAL_HABITS_WIDGET_STORAGE_KEY = "goalHabitsSnapshot";

export type GoalHabitsWidgetHabit = {
  id: number;
  title: string;
  done: boolean;
};

export type GoalHabitsSnapshot = {
  date: string;
  goalText: string;
  goalDone: boolean;
  habits: GoalHabitsWidgetHabit[];
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
}
