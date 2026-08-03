import type { DailyFocus, Habit, HabitCompletion } from "@/lib/db";
import { getLocalDateString } from "@/lib/timezone";

type EveningReflectionInput = {
  todayKey: string;
  focusRows: DailyFocus[];
  habits: Habit[];
  completions: HabitCompletion[];
};

export type EveningReflection = {
  summary: string;
  pattern: string;
};

const WINDOW_LABELS = {
  morning: "mornings",
  afternoon: "afternoons",
  evening: "evenings",
} as const;

function formatFocusDuration(minutes: number) {
  if (minutes < 60) return `${minutes} minutes`;

  const hours = minutes / 60;
  return Number.isInteger(hours) ? `${hours} hours` : `${hours.toFixed(1)} hours`;
}

function activityWindow(date: Date) {
  const hour = date.getHours();
  if (hour < 12) return "morning";
  if (hour < 18) return "afternoon";
  return "evening";
}

function getFocusStreak(focusRows: DailyFocus[], todayKey: string) {
  const rowMap = new Map(focusRows.map((row) => [row.date, row]));
  const date = new Date(`${todayKey}T12:00:00`);
  let streak = 0;

  for (let i = 0; i < 14; i += 1) {
    const key = getLocalDateString(date);
    const row = rowMap.get(key);
    if (!row || (row.focusMinutes ?? 0) <= 0) break;
    streak += 1;
    date.setDate(date.getDate() - 1);
  }

  return streak;
}

export function buildEveningReflection({
  todayKey,
  focusRows,
  habits,
  completions,
}: EveningReflectionInput): EveningReflection {
  const todayFocus = focusRows.find((row) => row.date === todayKey);
  const focusMinutes = todayFocus?.focusMinutes ?? 0;
  const todayCompletions = completions.filter(
    (completion) => completion.date === todayKey && completion.status === "done"
  );

  const habitNames = todayCompletions
    .map((completion) => habits.find((habit) => habit.id === completion.habitId)?.title)
    .filter((title): title is string => Boolean(title?.trim()));
  const firstHabitName = habitNames[0];

  const summary = (() => {
    if (focusMinutes > 0) {
      return `You protected ${formatFocusDuration(focusMinutes)} of focus today.`;
    }

    if (todayCompletions.length > 0) {
      return `You kept ${todayCompletions.length} habit${todayCompletions.length === 1 ? "" : "s"} alive today.`;
    }

    return "You still showed up for the reset tonight. That counts.";
  })();

  const pattern = (() => {
    const windowCounts = { morning: 0, afternoon: 0, evening: 0 };
    for (const row of focusRows) {
      if ((row.focusMinutes ?? 0) > 0) {
        windowCounts[activityWindow(row.updatedAt)] += 1;
      }
      if (row.completedAt) {
        windowCounts[activityWindow(row.completedAt)] += 1;
      }
    }
    for (const completion of completions) {
      if (completion.status === "done") {
        windowCounts[activityWindow(completion.createdAt)] += 1;
      }
    }

    const strongestWindow = (Object.entries(windowCounts) as [
      keyof typeof WINDOW_LABELS,
      number,
    ][]).sort((a, b) => b[1] - a[1])[0];

    if (strongestWindow?.[1] > 0) {
      return `Your strongest consistency window is ${WINDOW_LABELS[strongestWindow[0]]}.`;
    }

    const streak = getFocusStreak(focusRows, todayKey);
    if (streak >= 2) {
      return `You have a ${streak}-day focus streak. Keep the chain gentle and obvious.`;
    }

    if (firstHabitName) {
      return `${firstHabitName} is becoming one of your reliable anchors.`;
    }

    return "Your next pattern starts with one clear morning move.";
  })();

  return { summary, pattern };
}
