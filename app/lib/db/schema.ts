import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// ── profiles ─────────────────────────────────────────────────────────────────
export const profiles = sqliteTable('profiles', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name'),
  avatar: text('avatar'),
  timezone: text('timezone'),
  onboardingCompleted: integer('onboarding_completed', { mode: 'boolean' }).notNull().default(false),
  pushToken: text('push_token'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
});

// ── challenges ───────────────────────────────────────────────────────────────
// A bundled, fixed-duration set of daily rules (e.g. "69 Hard") started from a preset.
export const challenges = sqliteTable('challenges', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  presetId: text('preset_id').notNull(),
  title: text('title').notNull(),
  subtitle: text('subtitle'),
  icon: text('icon'),                            // Ionicon name
  durationDays: integer('duration_days').notNull(),
  startDate: text('start_date').notNull(),       // 'YYYY-MM-DD'
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
});

// ── habits ────────────────────────────────────────────────────────────────────
// Recurring daily habits (keystone + future unlocked ones)
export const habits = sqliteTable('habits', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  title: text('title').notNull(),
  subtitle: text('subtitle'),
  icon: text('icon'),                            // Ionicon name
  daysOfWeek: text('days_of_week', { mode: 'json' }).$type<string[]>().notNull(), // ['mon','tue',…]
  isLocked: integer('is_locked', { mode: 'boolean' }).notNull().default(false),
  sortOrder: integer('sort_order').notNull().default(0),
  challengeId: integer('challenge_id').references(() => challenges.id), // set when created as part of a preset challenge
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
});

// ── habit_completions ─────────────────────────────────────────────────────────
// One record per habit per day; status: 'done' | 'skipped'
export const habitCompletions = sqliteTable('habit_completions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  habitId: integer('habit_id').notNull().references(() => habits.id),
  date: text('date').notNull(),                  // 'YYYY-MM-DD'
  status: text('status').notNull().default('done'), // 'done' | 'skipped'
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
});

// ── daily_focus ───────────────────────────────────────────────────────────────
// One Main Goal per day (editable, not carried forward)
export const dailyFocus = sqliteTable('daily_focus', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  date: text('date').notNull().unique(),         // 'YYYY-MM-DD'
  goal: text('goal').notNull().default(''),
  focusMinutes: integer('focus_minutes').notNull().default(0),
  completedAt: integer('completed_at', { mode: 'timestamp' }),
  eveningResetCompletedAt: integer('evening_reset_completed_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
});

// ── daily_affirmations ───────────────────────────────────────────────────────
// AI-generated daily affirmation, cached locally by date.
export const dailyAffirmations = sqliteTable('daily_affirmations', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  date: text('date').notNull().unique(),         // 'YYYY-MM-DD'
  text: text('text').notNull(),
  source: text('source').notNull().default('ai'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
});

// ── TypeScript types ──────────────────────────────────────────────────────────
export type Profile = typeof profiles.$inferSelect;
export type NewProfile = typeof profiles.$inferInsert;

export type Challenge = typeof challenges.$inferSelect;
export type NewChallenge = typeof challenges.$inferInsert;

export type Habit = typeof habits.$inferSelect;
export type NewHabit = typeof habits.$inferInsert;

export type HabitCompletion = typeof habitCompletions.$inferSelect;
export type NewHabitCompletion = typeof habitCompletions.$inferInsert;

export type DailyFocus = typeof dailyFocus.$inferSelect;
export type NewDailyFocus = typeof dailyFocus.$inferInsert;

export type DailyAffirmationRow = typeof dailyAffirmations.$inferSelect;
export type NewDailyAffirmation = typeof dailyAffirmations.$inferInsert;
