import { eq, desc, asc, count, and } from 'drizzle-orm';
import {
  db,
  profiles, habits, habitCompletions, dailyFocus, dailyAffirmations, todos,
  type NewProfile, type NewHabit, type NewHabitCompletion, type NewDailyFocus,
  type NewDailyAffirmation,
} from './database';
import { ensureDatabaseInitialized } from './init';
import { getLocalDateString } from '../timezone';

async function withInitializedDb<T>(operation: () => Promise<T>): Promise<T> {
  await ensureDatabaseInitialized();
  return operation();
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
  async getAll() {
    return await withInitializedDb(() =>
      db.select().from(habits).orderBy(asc(habits.sortOrder), asc(habits.createdAt))
    );
  },
  async update(id: number, data: Partial<NewHabit>) {
    return await withInitializedDb(() =>
      db.update(habits).set(data).where(eq(habits.id, id)).returning()
    );
  },
  async delete(id: number) {
    return await withInitializedDb(() => db.delete(habits).where(eq(habits.id, id)));
  },
  async deleteAll() {
    return await withInitializedDb(() => db.delete(habits));
  },
};

// ── completionOps ─────────────────────────────────────────────────────────────
export const completionOps = {
  dateKey(date: Date): string {
    return getLocalDateString(date);
  },

  async markDone(habitId: number, date: Date) {
    const key = this.dateKey(date);
    return await withInitializedDb(() =>
      db.insert(habitCompletions)
        .values({ habitId, date: key, status: 'done' })
        .onConflictDoUpdate({
          target: [habitCompletions.habitId, habitCompletions.date],
          set: { status: 'done' },
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

  async markComplete() {
    const key = getLocalDateString(new Date());
    return await withInitializedDb(() =>
      db.insert(dailyFocus)
        .values({
          date: key,
          completedAt: new Date(),
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [dailyFocus.date],
          set: { completedAt: new Date(), updatedAt: new Date() },
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

// ── todoOps ───────────────────────────────────────────────────────────────────
export const todoOps = {
  async getByDate(date: string) {
    return await withInitializedDb(() =>
      db.select().from(todos)
        .where(eq(todos.date, date))
        .orderBy(asc(todos.sortOrder), asc(todos.createdAt))
    );
  },

  async add(date: string, title: string) {
    return await withInitializedDb(() => db.insert(todos).values({ date, title }).returning());
  },

  async toggle(id: number, done: boolean) {
    return await withInitializedDb(() =>
      db.update(todos).set({ done }).where(eq(todos.id, id)).returning()
    );
  },

  async delete(id: number) {
    return await withInitializedDb(() => db.delete(todos).where(eq(todos.id, id)));
  },
};
