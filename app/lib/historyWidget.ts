import { ExtensionStorage } from "@kingstinct/expo-apple-targets";
import { GOAL_HABITS_APP_GROUP } from "./goalHabitsWidget";
import { DAY_NAMES } from "./performance";
import { getLocalDateString } from "./timezone";

export const WEEK_WIDGET_KIND = "WeekStripWidget";
export const MONTH_WIDGET_KIND = "MonthGridWidget";
export const HISTORY_WIDGET_STORAGE_KEY = "historySnapshot";

// Enough days on both sides of today for the widget to lay out the current
// week (week strip) and one week before + three after (month grid), whatever
// the device's first weekday is - the widget picks the window itself.
const DAYS_BEFORE = 13;
const DAYS_AFTER = 27;

export type HistoryHabitStatus = "done" | "skipped" | "todo";

export type HistoryDay = {
  date: string;
  goal: string;
  goalDone: boolean;
  habits: { title: string; status: HistoryHabitStatus }[];
};

export type HistorySnapshot = {
  today: string;
  days: HistoryDay[];
};

type HabitRow = {
  id: number;
  title: string;
  daysOfWeek: unknown;
  sortOrder: number;
  createdAt: Date;
};
type CompletionRow = { habitId: number; date: string; status: string };
type FocusRow = { date: string; goal: string; completedAt: Date | null };

export function historyWindowStartKey(today: Date): string {
  const start = new Date(today);
  start.setDate(start.getDate() - DAYS_BEFORE);
  return getLocalDateString(start);
}

export function buildHistory(
  today: Date,
  habitRows: HabitRow[],
  completions: CompletionRow[],
  focusRows: FocusRow[],
): HistorySnapshot {
  const todayKey = getLocalDateString(today);
  const sortedHabits = [...habitRows].sort((a, b) => a.sortOrder - b.sortOrder);
  const focusByDate = new Map(focusRows.map((row) => [row.date, row]));
  const statusByKey = new Map(
    completions.map((row) => [`${row.habitId}:${row.date}`, row.status]),
  );

  const days: HistoryDay[] = [];
  for (let offset = -DAYS_BEFORE; offset <= DAYS_AFTER; offset++) {
    const day = new Date(today);
    day.setDate(day.getDate() + offset);
    const date = getLocalDateString(day);
    const dayName = DAY_NAMES[day.getDay()];

    const habits = sortedHabits.flatMap((habit) => {
      const status = statusByKey.get(`${habit.id}:${date}`);
      // Don't show a habit as missed on days before it existed.
      const isDue =
        (habit.daysOfWeek as string[]).includes(dayName) &&
        getLocalDateString(habit.createdAt) <= date;
      if (!status && !isDue) return [];
      const normalized: HistoryHabitStatus =
        status === "done" ? "done" : status === "skipped" ? "skipped" : "todo";
      return [{ title: habit.title, status: normalized }];
    });

    const focus = focusByDate.get(date);
    days.push({
      date,
      goal: (focus?.goal ?? "").trim(),
      goalDone: Boolean(focus?.completedAt),
      habits,
    });
  }

  return { today: todayKey, days };
}

export function syncHistoryWidgets(snapshot: HistorySnapshot) {
  const extensionStorage = new ExtensionStorage(GOAL_HABITS_APP_GROUP);
  // See syncGoalHabitsWidget: ExtensionStorage JSON-encodes nested values.
  extensionStorage.set(
    HISTORY_WIDGET_STORAGE_KEY,
    snapshot as unknown as Record<string, string | number>,
  );
  ExtensionStorage.reloadWidget(WEEK_WIDGET_KIND);
  ExtensionStorage.reloadWidget(MONTH_WIDGET_KIND);
}
