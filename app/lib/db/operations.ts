import { eq, desc, asc, count, and, isNull, isNotNull } from 'drizzle-orm';
import {
  db,
  profiles, habits, habitCompletions, dailyFocus, dailyAffirmations, challenges, journalEntries,
  type NewProfile, type NewHabit, type NewHabitCompletion, type NewDailyFocus,
  type NewDailyAffirmation, type NewJournalEntry,
} from './database';
import { ensureDatabaseInitialized } from './init';
import { getLocalDateString } from '../timezone';
import type { PresetChallenge } from '../presetChallenges';
import { notifyDataChanged } from './changeListener';

const ALL_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

async function withInitializedDb<T>(operation: () => Promise<T>): Promise<T> {
  await ensureDatabaseInitialized();
  const result = await operation();
  notifyDataChanged();
  return result;
}

// ── profileOps ────────────────────────────────────────────────────────────────
export const profileOps = {
  async create(data: NewProfile) {
    return await withInitializedDb(() => db.insert(profiles).values(data).returning());
  },
  async getFirst() {
    const result = await withInitializedDb(() => db.select().from(profiles).limit(1));
    return result[0] ?? null;
  },
  async update(id: number, data: Partial<NewProfile>) {
    return await withInitializedDb(() =>
      db.update(profiles).set(data).where(eq(profiles.id, id)).returning()
    );
  },
  async deleteAll() {
    return await withInitializedDb(() => db.delete(profiles));
  },
};

// ── habitOps ──────────────────────────────────────────────────────────────────
export const habitOps = {
  async create(data: NewHabit) {
    return await withInitializedDb(() => db.insert(habits).values(data).returning());
  },
  // Active habits only - what the user is tracking right now.
  async getAll() {
    return await withInitializedDb(() =>
      db.select().from(habits)
        .where(isNull(habits.archivedAt))
        .orderBy(asc(habits.sortOrder), asc(habits.createdAt))
    );
  },
  // Every habit ever created, archived included. Use for analytics and for
  // resolving titles of past completions.
  async getAllIncludingArchived() {
    return await withInitializedDb(() =>
      db.select().from(habits).orderBy(asc(habits.sortOrder), asc(habits.createdAt))
    );
  },
  async getArchived() {
    return await withInitializedDb(() =>
      db.select().from(habits)
        .where(isNotNull(habits.archivedAt))
        .orderBy(desc(habits.archivedAt))
    );
  },
  async update(id: number, data: Partial<NewHabit>) {
    return await withInitializedDb(() =>
      db.update(habits).set(data).where(eq(habits.id, id)).returning()
    );
  },
  // Soft delete: the habit disappears from active lists but its completions stay
  // available for profile stats and history.
  async delete(id: number) {
    return await withInitializedDb(() =>
      db.update(habits).set({ archivedAt: new Date() }).where(eq(habits.id, id))
    );
  },
  async restore(id: number) {
    return await withInitializedDb(() =>
      db.update(habits).set({ archivedAt: null }).where(eq(habits.id, id))
    );
  },
  async deleteAll() {
    return await withInitializedDb(() => db.delete(habits));
  },
};

// ── completionOps ─────────────────────────────────────────────────────────────
export type HabitCheckIn = {
  photoUri?: string | null;
  note?: string | null;
};

export const completionOps = {
  dateKey(date: Date): string {
    return getLocalDateString(date);
  },

  // `checkIn` carries the optional proof photo and self-reflection the user
  // attaches when marking the habit done. Omitting it clears both fields, so
  // an edit that removes the photo/note is persisted as such.
  async markDone(habitId: number, date: Date, checkIn?: HabitCheckIn) {
    const key = this.dateKey(date);
    const photoUri = checkIn?.photoUri?.trim() || null;
    const note = checkIn?.note?.trim() || null;
    return await withInitializedDb(() =>
      db.insert(habitCompletions)
        .values({ habitId, date: key, status: 'done', photoUri, note })
        .onConflictDoUpdate({
          target: [habitCompletions.habitId, habitCompletions.date],
          set: { status: 'done', photoUri, note },
        })
        .returning()
    );
  },

  async markUndone(habitId: number, date: Date) {
    const key = this.dateKey(date);
    return await withInitializedDb(() =>
      db.delete(habitCompletions).where(
        and(eq(habitCompletions.habitId, habitId), eq(habitCompletions.date, key))
      )
    );
  },

  async getForDate(habitId: number, date: Date) {
    const key = this.dateKey(date);
    const rows = await withInitializedDb(() =>
      db.select().from(habitCompletions)
        .where(and(eq(habitCompletions.habitId, habitId), eq(habitCompletions.date, key)))
        .limit(1)
    );
    return rows[0] ?? null;
  },

  async markSkipped(habitId: number, date: Date) {
    const key = this.dateKey(date);
    return await withInitializedDb(() =>
      db.insert(habitCompletions)
        .values({ habitId, date: key, status: 'skipped' })
        .onConflictDoNothing()
        .returning()
    );
  },

  async markSkippedBulk(habitIds: number[], date: Date) {
    if (habitIds.length === 0) return;
    const key = this.dateKey(date);
    await withInitializedDb(() =>
      db.insert(habitCompletions)
        .values(habitIds.map(habitId => ({ habitId, date: key, status: 'skipped' })))
        .onConflictDoNothing()
    );
  },

  async getAll() {
    return await withInitializedDb(() =>
      db.select().from(habitCompletions).orderBy(desc(habitCompletions.createdAt))
    );
  },

  async deleteByHabitId(habitId: number) {
    return await withInitializedDb(() =>
      db.delete(habitCompletions).where(eq(habitCompletions.habitId, habitId))
    );
  },

  async deleteAll() {
    return await withInitializedDb(() => db.delete(habitCompletions));
  },
};

// ── challengeOps ──────────────────────────────────────────────────────────────
// Preset challenges (e.g. "69 Hard"): a fixed-duration bundle of habits started together.
export const challengeOps = {
  async getAll() {
    return await withInitializedDb(() =>
      db.select().from(challenges)
        .where(isNull(challenges.archivedAt))
        .orderBy(desc(challenges.createdAt))
    );
  },

  // Includes quit/finished challenges - their habits and check-ins are still
  // part of the user's history.
  async getAllIncludingArchived() {
    return await withInitializedDb(() =>
      db.select().from(challenges).orderBy(desc(challenges.createdAt))
    );
  },

  async start(preset: PresetChallenge) {
    return await withInitializedDb(async () => {
      const startDate = getLocalDateString(new Date());
      const [challenge] = await db.insert(challenges).values({
        presetId: preset.id,
        title: preset.title,
        subtitle: preset.subtitle,
        icon: preset.icon,
        durationDays: preset.durationDays,
        startDate,
      }).returning();

      const existingHabits = await db.select({ id: habits.id }).from(habits)
        .where(isNull(habits.archivedAt));
      const baseSortOrder = existingHabits.length;

      const newHabits = await db.insert(habits).values(
        preset.rules.map((rule, index) => ({
          title: rule.title,
          subtitle: rule.subtitle ?? null,
          icon: rule.icon,
          daysOfWeek: [...ALL_DAYS],
          isLocked: false,
          sortOrder: baseSortOrder + index,
          challengeId: challenge.id,
        }))
      ).returning();

      return { challenge, habits: newHabits };
    });
  },

  // Quitting a challenge archives it together with the habits it created. Nothing is
  // hard-deleted, so past check-ins still count towards profile stats.
  async end(id: number) {
    return await withInitializedDb(async () => {
      const archivedAt = new Date();
      await db.update(habits).set({ archivedAt }).where(
        and(eq(habits.challengeId, id), isNull(habits.archivedAt))
      );
      await db.update(challenges).set({ archivedAt }).where(eq(challenges.id, id));
    });
  },

  async deleteAll() {
    return await withInitializedDb(() => db.delete(challenges));
  },
};

// ── dailyFocusOps ─────────────────────────────────────────────────────────────
export const dailyFocusOps = {
  async getToday(): Promise<typeof dailyFocus.$inferSelect | null> {
    const key = getLocalDateString(new Date());
    const result = await withInitializedDb(() =>
      db.select().from(dailyFocus).where(eq(dailyFocus.date, key)).limit(1)
    );
    return result[0] ?? null;
  },

  async upsertGoal(goal: string | null) {
    const key = getLocalDateString(new Date());
    const normalizedGoal = goal?.trim() ?? "";
    return await withInitializedDb(() =>
      db.insert(dailyFocus)
        .values({ date: key, goal: normalizedGoal, updatedAt: new Date() })
        .onConflictDoUpdate({
          target: [dailyFocus.date],
          set: { goal: normalizedGoal, updatedAt: new Date() },
        })
        .returning()
    );
  },

  async addFocusMinutes(minutes: number) {
    const key = getLocalDateString(new Date());
    const normalizedMinutes = Math.max(0, Math.round(minutes));
    if (normalizedMinutes === 0) return [];

    const existing = await withInitializedDb(() =>
      db.select().from(dailyFocus).where(eq(dailyFocus.date, key)).limit(1)
    );
    const current = existing[0];
    const nextFocusMinutes = (current?.focusMinutes ?? 0) + normalizedMinutes;

    return await withInitializedDb(() =>
      db.insert(dailyFocus)
        .values({
          date: key,
          goal: current?.goal ?? "",
          focusMinutes: normalizedMinutes,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [dailyFocus.date],
          set: {
            focusMinutes: nextFocusMinutes,
            updatedAt: new Date(),
          },
        })
        .returning()
    );
  },

  async markComplete(videoUri?: string) {
    const key = getLocalDateString(new Date());
    return await withInitializedDb(() =>
      db.insert(dailyFocus)
        .values({
          date: key,
          completedAt: new Date(),
          updatedAt: new Date(),
          ...(videoUri ? { videoUri } : {}),
        })
        .onConflictDoUpdate({
          target: [dailyFocus.date],
          set: {
            completedAt: new Date(),
            updatedAt: new Date(),
            ...(videoUri ? { videoUri } : {}),
          },
        })
        .returning()
    );
  },

  async markIncomplete() {
    const key = getLocalDateString(new Date());
    return await withInitializedDb(() =>
      db.update(dailyFocus)
        .set({ completedAt: null, updatedAt: new Date() })
        .where(eq(dailyFocus.date, key))
        .returning()
    );
  },

  async markEveningResetComplete() {
    const key = getLocalDateString(new Date());
    return await withInitializedDb(() =>
      db.insert(dailyFocus)
        .values({
          date: key,
          eveningResetCompletedAt: new Date(),
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [dailyFocus.date],
          set: { eveningResetCompletedAt: new Date(), updatedAt: new Date() },
        })
        .returning()
    );
  },

  async markEveningResetIncomplete() {
    const key = getLocalDateString(new Date());
    return await withInitializedDb(() =>
      db.update(dailyFocus)
        .set({ eveningResetCompletedAt: null, updatedAt: new Date() })
        .where(eq(dailyFocus.date, key))
        .returning()
    );
  },
};

// ── journalEntryOps ───────────────────────────────────────────────────────────
export const journalEntryOps = {
  async create(data: Omit<NewJournalEntry, 'date'> & { date?: string }) {
    const date = data.date ?? getLocalDateString(new Date());
    const note = data.note?.trim() || null;
    const photoUri = data.photoUri?.trim() || null;
    return await withInitializedDb(() =>
      db.insert(journalEntries).values({ date, note, photoUri }).returning()
    );
  },

  async getAll() {
    return await withInitializedDb(() =>
      db.select().from(journalEntries).orderBy(desc(journalEntries.createdAt))
    );
  },

  async delete(id: number) {
    return await withInitializedDb(() =>
      db.delete(journalEntries).where(eq(journalEntries.id, id))
    );
  },

  async deleteAll() {
    return await withInitializedDb(() => db.delete(journalEntries));
  },
};

// ── dailyAffirmationOps ──────────────────────────────────────────────────────
export const dailyAffirmationOps = {
  async getByDate(date: string) {
    const result = await withInitializedDb(() =>
      db.select().from(dailyAffirmations).where(eq(dailyAffirmations.date, date)).limit(1)
    );
    return result[0] ?? null;
  },

  async upsert(data: NewDailyAffirmation) {
    return await withInitializedDb(() =>
      db.insert(dailyAffirmations)
        .values({ ...data, updatedAt: new Date() })
        .onConflictDoUpdate({
          target: [dailyAffirmations.date],
          set: {
            text: data.text,
            source: data.source ?? 'ai',
            updatedAt: new Date(),
          },
        })
        .returning()
    );
  },
};
