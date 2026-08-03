import {
  startOfWeek,
  addWeeks,
  addDays,
  isAfter,
  startOfYear,
  endOfYear,
} from "date-fns";
import { getLocalDateString } from "./timezone";
import {
  GRID_CONSTANTS,
  COLOR_THRESHOLDS,
  MONTHS,
} from "@/constants/performance";

// Types
export interface HeatmapDay {
  date: Date;
  count: number;
  isCurrentYear: boolean;
  isPastOrToday: boolean;
}

export interface MonthLabel {
  label: string;
  weekIndex: number;
}

export interface ColorConfig {
  backgroundColor: string;
  borderColor?: string;
  borderWidth?: number;
}

interface DatedCompletion {
  completedDate: string;
  status?: string | null;
}

const EMPTY_BOUNCEBACK_RESULT: BouncebackResult = {
  rate: 1,
  lastRecoveryDays: -1,
  totalFalls: 0,
  totalRecovered: 0,
};

// Utility Functions
export function getDateKey(date: Date): string {
  return getLocalDateString(date);
}

export function getColorForCount(
  count: number,
  isPastOrToday: boolean,
): ColorConfig {
  if (!isPastOrToday) {
    return {
      backgroundColor: "rgba(255, 255, 255, 0.1)",
      borderColor: "rgba(255, 255, 255, 0.2)",
      borderWidth: 1,
    };
  }

  if (count === COLOR_THRESHOLDS.NONE) {
    return {
      backgroundColor: "rgba(255, 255, 255, 0.1)",
      borderColor: "rgba(255, 255, 255, 0.1)",
      borderWidth: 1,
    };
  }
  if (count <= COLOR_THRESHOLDS.LOW) return { backgroundColor: "#fed7aa" };
  if (count <= COLOR_THRESHOLDS.MEDIUM) return { backgroundColor: "#fb923c" };
  if (count <= COLOR_THRESHOLDS.HIGH) return { backgroundColor: "#ea580c" };
  return { backgroundColor: "#c2410c" };
}

export function generateMonthLabels(weeks: HeatmapDay[][]): MonthLabel[] {
  const monthLabels: MonthLabel[] = [];
  let lastMonth = -1;
  let lastYear = -1;

  weeks.forEach((week, weekIndex) => {
    // Use the first day that's within the grid (isCurrentYear) for label placement
    const firstInGridDay = week.find((d) => d.isCurrentYear);
    if (!firstInGridDay) return;
    const currentMonth = firstInGridDay.date.getMonth();
    const currentYear = firstInGridDay.date.getFullYear();

    if (currentMonth !== lastMonth || currentYear !== lastYear) {
      const includeYear =
        currentYear !== lastYear && (lastYear !== -1 || currentMonth === 0);
      const label = includeYear
        ? `${MONTHS[currentMonth]} ${currentYear.toString().slice(-2)}`
        : MONTHS[currentMonth];

      monthLabels.push({ label, weekIndex });
      lastMonth = currentMonth;
      lastYear = currentYear;
    }
  });

  return monthLabels;
}

function createWeekDays(
  weekStart: Date,
  gridStart: Date,
  gridEnd: Date,
): HeatmapDay[] {
  const today = new Date();
  const weekDays: HeatmapDay[] = [];

  for (let day = 0; day < 7; day++) {
    const dateForDay = addDays(weekStart, day);
    weekDays.push({
      date: dateForDay,
      count: 0,
      isCurrentYear: dateForDay >= gridStart && dateForDay <= gridEnd,
      isPastOrToday: !isAfter(dateForDay, today),
    });
  }

  return weekDays;
}

export function generateUserGrid(_userCreationDate: Date): HeatmapDay[][] {
  const now = new Date();
  const gridStart = startOfYear(now);
  const gridEnd = endOfYear(now);
  const weekGridStart = startOfWeek(gridStart, {
    weekStartsOn: GRID_CONSTANTS.WEEK_START_DAY,
  });

  const weeks: HeatmapDay[][] = [];
  let currentWeekStart = weekGridStart;

  while (
    currentWeekStart <= gridEnd ||
    weeks.length < GRID_CONSTANTS.MIN_WEEKS
  ) {
    weeks.push(createWeekDays(currentWeekStart, gridStart, gridEnd));
    currentWeekStart = addWeeks(currentWeekStart, 1);

    if (
      currentWeekStart > addWeeks(gridEnd, GRID_CONSTANTS.SAFETY_BUFFER_WEEKS)
    )
      break;
  }

  return weeks;
}




export const DAY_NAMES = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

// ── Bounce-back Rate ─────────────────────────────────────────────────────────
// After a 'failed' day, how quickly does the user return to 'done'?
// Returns rate (0–1) and last recovery days.

export interface BouncebackResult {
  rate: number;             // % of recovery events where user bounced back within 3 days (0–1)
  lastRecoveryDays: number; // days it took to recover after the most recent gap (-1 if no gap)
  totalFalls: number;       // total number of "fall" events (days with only failed records)
  totalRecovered: number;   // how many falls led to a comeback within 3 days
}

export function computeBouncebackRate(
  completions: DatedCompletion[],
): BouncebackResult {
  if (completions.length === 0) {
    return EMPTY_BOUNCEBACK_RESULT;
  }

  // Group by date: determine if a date is 'done' (at least one done) or 'failed-only'
  const doneSet = new Set<string>();
  const allDatesSet = new Set<string>();

  for (const c of completions) {
    allDatesSet.add(c.completedDate);
    if (c.status === "done") doneSet.add(c.completedDate);
  }

  // Sort all unique dates that have any record
  const allDates = Array.from(allDatesSet).sort();
  if (allDates.length === 0) {
    return EMPTY_BOUNCEBACK_RESULT;
  }

  let totalFalls = 0;
  let totalRecovered = 0;
  let lastRecoveryDays = -1;

  // Find gaps: consecutive dates where user had failed records but no done records
  // then measure how long until the next done date
  for (let i = 0; i < allDates.length; i++) {
    const date = allDates[i];
    if (!doneSet.has(date)) {
      // This is a fall day - find next done date
      totalFalls++;
      let recoveryDays = -1;
      for (let j = i + 1; j < allDates.length && j <= i + 5; j++) {
        if (doneSet.has(allDates[j])) {
          const fallDate = new Date(`${date}T00:00:00`);
          const comebackDate = new Date(`${allDates[j]}T00:00:00`);
          const diffMs = comebackDate.getTime() - fallDate.getTime();
          recoveryDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
          break;
        }
      }
      if (recoveryDays >= 1 && recoveryDays <= 3) {
        totalRecovered++;
        lastRecoveryDays = recoveryDays;
      }
    }
  }

  const rate = totalFalls === 0 ? 1 : totalRecovered / totalFalls;
  return { rate, lastRecoveryDays, totalFalls, totalRecovered };
}

// ── Weekly Completion Rates ───────────────────────────────────────────────────





// ── Effect Size Compounder ────────────────────────────────────────────────────
// Visualize 1.01^N compound growth where N = active days

export interface CompoundPoint {
  x: number; // day index (0–N)
  y: number; // 1.01^x
}

const EFFECT_CURVE_HORIZON = 365;

export function computeEffectSizeCurve(
  activeDays: number,
  points: number = 120,
): CompoundPoint[] {
  const N = Math.max(activeDays, EFFECT_CURVE_HORIZON);
  const result: CompoundPoint[] = [];
  for (let i = 0; i <= points; i++) {
    const x = (i / points) * N;
    result.push({ x, y: Math.pow(1.01, x) });
  }
  return result;
}



// ── Adaptability Score ────────────────────────────────────────────────────────
// Count of weeks where user tweaked their plan (intentTag = 'tweak_goal')



export function computeStreaks(dateCounts: Record<string, number>): {
  currentStreak: number;
  bestStreak: number;
} {
  const today = new Date();
  const todayKey = getLocalDateString(today);

  // Current streak: walk backward from today
  let currentStreak = 0;
  const cursor = new Date(today);
  while (true) {
    const key = getLocalDateString(cursor);
    if (dateCounts[key] > 0) {
      currentStreak++;
      cursor.setDate(cursor.getDate() - 1);
    } else {
      // If today has no data yet, don't break the streak - check yesterday
      if (key === todayKey && currentStreak === 0) {
        cursor.setDate(cursor.getDate() - 1);
        continue;
      }
      break;
    }
  }

  // Best streak: iterate all dates with done records in sorted order
  const doneDates = Object.keys(dateCounts)
    .filter((k) => dateCounts[k] > 0)
    .sort();

  let bestStreak = currentStreak;
  let runLength = 0;
  let prevDate: string | null = null;

  for (const dateKey of doneDates) {
    if (prevDate === null) {
      runLength = 1;
    } else {
      // Check if consecutive day
      const prev = new Date(prevDate + 'T00:00:00');
      prev.setDate(prev.getDate() + 1);
      const expectedNext = getLocalDateString(prev);
      runLength = expectedNext === dateKey ? runLength + 1 : 1;
    }
    if (runLength > bestStreak) bestStreak = runLength;
    prevDate = dateKey;
  }

  return { currentStreak, bestStreak };
}
