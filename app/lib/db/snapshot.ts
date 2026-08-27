import { expoDb } from "./database";

export const SNAPSHOT_VERSION = 1;

export type DataSnapshot = {
  version: number;
  profiles: Record<string, unknown>[];
  challenges: Record<string, unknown>[];
  habits: Record<string, unknown>[];
  habit_completions: Record<string, unknown>[];
  daily_focus: Record<string, unknown>[];
  daily_affirmations: Record<string, unknown>[];
  // Device-local preferences (theme, reminders, app lock). Optional and
  // ignored by importSnapshot - cloudSync attaches/applies it separately
  // since it lives in MMKV, not these SQLite tables.
  settings?: Record<string, unknown>;
};

const tables = [
  "profiles",
  "challenges",
  "habits",
  "habit_completions",
  "daily_focus",
  "daily_affirmations",
] as const;

export async function exportSnapshot(): Promise<DataSnapshot> {
  const snapshot = { version: SNAPSHOT_VERSION } as DataSnapshot;
  for (const table of tables) {
    snapshot[table] = await expoDb.getAllAsync<Record<string, unknown>>(
      `SELECT * FROM ${table} ORDER BY id ASC`,
    );
  }
  return snapshot;
}

function value(row: Record<string, unknown>, key: string) {
  const raw = row[key];
  return raw === null || typeof raw === "string" || typeof raw === "number" ? raw : null;
}

export async function importSnapshot(snapshot: DataSnapshot) {
  if (snapshot.version !== SNAPSHOT_VERSION) {
    throw new Error("This backup was created by an incompatible app version.");
  }

  await expoDb.withTransactionAsync(async () => {
    for (const table of [...tables].reverse()) {
      await expoDb.runAsync(`DELETE FROM ${table}`);
    }

    for (const row of snapshot.profiles) {
      await expoDb.runAsync(
        `INSERT INTO profiles (id, name, avatar, timezone, onboarding_completed, push_token, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        value(row, "id"), value(row, "name"), value(row, "avatar"), value(row, "timezone"),
        value(row, "onboarding_completed"), value(row, "push_token"), value(row, "created_at"),
      );
    }
    for (const row of snapshot.challenges) {
      await expoDb.runAsync(
        `INSERT INTO challenges (id, preset_id, title, subtitle, icon, duration_days, start_date, archived_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        value(row, "id"), value(row, "preset_id"), value(row, "title"), value(row, "subtitle"),
        value(row, "icon"), value(row, "duration_days"), value(row, "start_date"),
        value(row, "archived_at"), value(row, "created_at"),
      );
    }
    for (const row of snapshot.habits) {
      await expoDb.runAsync(
        `INSERT INTO habits (id, title, subtitle, icon, days_of_week, is_locked, sort_order, challenge_id, archived_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        value(row, "id"), value(row, "title"), value(row, "subtitle"), value(row, "icon"),
        value(row, "days_of_week"), value(row, "is_locked"), value(row, "sort_order"),
        value(row, "challenge_id"), value(row, "archived_at"), value(row, "created_at"),
      );
    }
    for (const row of snapshot.habit_completions) {
      await expoDb.runAsync(
        `INSERT INTO habit_completions (id, habit_id, date, status, photo_uri, note, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        value(row, "id"), value(row, "habit_id"), value(row, "date"), value(row, "status"),
        value(row, "photo_uri"), value(row, "note"), value(row, "created_at"),
      );
    }
    for (const row of snapshot.daily_focus) {
      await expoDb.runAsync(
        `INSERT INTO daily_focus (id, date, goal, focus_minutes, completed_at, evening_reset_completed_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        value(row, "id"), value(row, "date"), value(row, "goal"), value(row, "focus_minutes"),
        value(row, "completed_at"), value(row, "evening_reset_completed_at"), value(row, "created_at"),
        value(row, "updated_at"),
      );
    }
    for (const row of snapshot.daily_affirmations) {
      await expoDb.runAsync(
        `INSERT INTO daily_affirmations (id, date, text, source, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        value(row, "id"), value(row, "date"), value(row, "text"), value(row, "source"),
        value(row, "created_at"), value(row, "updated_at"),
      );
    }
  });
}
