import {
  db,
  dailyFocus,
  habitCompletions,
  habits,
  profiles,
} from "@/lib/db";
import { resetDatabase } from "@/lib/db/init";
import { getLocalDateString } from "@/lib/timezone";

const EVERY_DAY = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

function daysAgo(count: number) {
  const date = new Date();
  date.setHours(9, 0, 0, 0);
  date.setDate(date.getDate() - count);
  return date;
}

function dateKey(count: number) {
  return getLocalDateString(daysAgo(count));
}

export const insertAllScreenshotData = async () => {
  await resetDatabase();

  // Habits go back ~5 months so the year-to-date consistency grids
  // (profile screen, heatmap) read as an established, lived-in habit
  // practice rather than a sparse new account.
  const habitAgeDays = [148, 134, 119, 96];

  await db.insert(profiles).values({
    name: "Maya",
    avatar: "game:star-bard",
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    onboardingCompleted: true,
    createdAt: daysAgo(habitAgeDays[0] + 4),
  });

  const insertedHabits = await db
    .insert(habits)
    .values([
      {
        title: "Morning sunlight",
        subtitle: "10 min outside",
        icon: "sunny-outline",
        daysOfWeek: EVERY_DAY,
        sortOrder: 0,
        createdAt: daysAgo(habitAgeDays[0]),
      },
      {
        title: "Deep work block",
        subtitle: "25 focused min",
        icon: "timer-outline",
        daysOfWeek: EVERY_DAY,
        sortOrder: 1,
        createdAt: daysAgo(habitAgeDays[1]),
      },
      {
        title: "5-min journaling",
        subtitle: "One honest note",
        icon: "journal-outline",
        daysOfWeek: EVERY_DAY,
        sortOrder: 2,
        createdAt: daysAgo(habitAgeDays[2]),
      },
      {
        title: "Evening reset",
        subtitle: "Close the loops",
        icon: "moon-outline",
        daysOfWeek: EVERY_DAY,
        sortOrder: 3,
        createdAt: daysAgo(habitAgeDays[3]),
      },
    ])
    .returning();

  // A small, sparse set of early skips (only in the first half of each
  // habit's life) keeps the long-range consistency grid from looking
  // perfectly uniform, while the last 3 weeks are a clean unbroken run
  // so "current streak" and "today" both look strong.
  const earlySkipOffsets = [
    new Set([91, 77, 63, 50]),
    new Set([88, 70, 55]),
    new Set([60, 41]),
    new Set([45]),
  ];

  const completionRows: (typeof habitCompletions.$inferInsert)[] = [];
  insertedHabits.forEach((habit, habitIndex) => {
    for (let offset = habitAgeDays[habitIndex]; offset >= 0; offset -= 1) {
      const skipped = offset > 21 && earlySkipOffsets[habitIndex].has(offset);

      completionRows.push({
        habitId: habit.id,
        date: dateKey(offset),
        status: skipped ? "skipped" : "done",
        createdAt: daysAgo(offset),
      });
    }
  });
  await db.insert(habitCompletions).values(completionRows);

  // Daily focus powers the built-in "Main Goal" and "Evening Reset"
  // heatmaps. Give them distinct, human-looking histories: the main goal
  // is steady and high-performing, while the evening reset has a rougher
  // adoption curve before settling into a strong recent streak.
  const focusGoals = [
    "Protect one meaningful deep work block",
    "Ship the thing before checking messages",
    "Single-task the hardest item first",
    "Close every open loop before evening",
    "Make one visible pass on the launch story",
    "Finish the screenshot flow without context switching",
  ];
  const missedMainGoalOffsets = new Set([82, 73, 65, 51, 44, 32, 23, 18]);
  const missedEveningResetOffsets = new Set([
    88, 86, 83, 79, 76, 72, 68, 65, 61, 57, 54, 49, 45, 41, 36, 31, 25, 19,
  ]);
  const focusRows = Array.from({ length: 92 }, (_, index) => {
    const offset = 91 - index;
    const base = 22 + index * 0.42;
    const wobble = [0, 7, -3, 5, -5, 8, 2, -1][index % 8];
    const minutes = Math.max(15, Math.round(base + wobble));
    const goal =
      offset === 0
        ? "Finish the launch review and capture clean App Store screenshots"
        : focusGoals[index % focusGoals.length];
    const rowDate = daysAgo(offset);
    const completedAt = missedMainGoalOffsets.has(offset)
      ? null
      : new Date(rowDate.getFullYear(), rowDate.getMonth(), rowDate.getDate(), 11, 15);
    const eveningResetCompletedAt = missedEveningResetOffsets.has(offset)
      ? null
      : new Date(rowDate.getFullYear(), rowDate.getMonth(), rowDate.getDate(), 20, 45);

    return {
      date: dateKey(offset),
      goal,
      focusMinutes: minutes,
      completedAt,
      eveningResetCompletedAt,
      createdAt: rowDate,
      updatedAt: rowDate,
    };
  });
  await db.insert(dailyFocus).values(focusRows);
};
