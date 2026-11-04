import { ExtensionStorage } from "@kingstinct/expo-apple-targets";
import { GOAL_HABITS_APP_GROUP } from "./goalHabitsWidget";

export const YEAR_PROGRESS_WIDGET_KIND = "YearProgressWidget";
export const YEAR_PROGRESS_WIDGET_STORAGE_KEY = "yearProgressSnapshot";

export type YearProgressSnapshot = {
  year: number;
  // Days this year where the main task was completed or at least one habit
  // was done - each one counts as a "1% better" day (1.01^keptDays).
  keptDays: number;
  // Share of elapsed days kept, per month (0-1). -1 marks future months.
  months: number[];
};

type FocusRow = { date: string; completedAt: Date | null };
type CompletionRow = { date: string; status: string };

export function buildYearProgress(
  todayKey: string,
  focusRows: FocusRow[],
  completions: CompletionRow[],
): YearProgressSnapshot {
  const year = Number(todayKey.slice(0, 4));
  const prefix = `${year}-`;
  const isThisYearSoFar = (date: string) =>
    date.startsWith(prefix) && date <= todayKey;

  const kept = new Set<string>();
  for (const row of focusRows) {
    if (row.completedAt && isThisYearSoFar(row.date)) kept.add(row.date);
  }
  for (const row of completions) {
    if (row.status === "done" && isThisYearSoFar(row.date)) kept.add(row.date);
  }

  const keptPerMonth = new Array<number>(12).fill(0);
  for (const date of kept) keptPerMonth[Number(date.slice(5, 7)) - 1] += 1;

  const todayMonth = Number(todayKey.slice(5, 7));
  const todayDay = Number(todayKey.slice(8, 10));
  const months = keptPerMonth.map((count, index) => {
    const month = index + 1;
    if (month > todayMonth) return -1;
    const elapsed =
      month === todayMonth ? todayDay : new Date(year, month, 0).getDate();
    return Math.min(1, count / elapsed);
  });

  return { year, keptDays: kept.size, months };
}

export function syncYearProgressWidget(snapshot: YearProgressSnapshot) {
  const extensionStorage = new ExtensionStorage(GOAL_HABITS_APP_GROUP);
  // See syncGoalHabitsWidget: ExtensionStorage JSON-encodes nested values.
  extensionStorage.set(
    YEAR_PROGRESS_WIDGET_STORAGE_KEY,
    snapshot as unknown as Record<string, string | number>,
  );
  ExtensionStorage.reloadWidget(YEAR_PROGRESS_WIDGET_KIND);
}
