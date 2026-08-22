import { deleteAllHabitPhotos } from '@/lib/habitPhotos';
import { storage } from '@/lib/storage';
import { expoDb } from './database';

let initializationPromise: Promise<void> | null = null;

export async function resetDatabase() {
  try {
    const tables = ['habit_completions', 'habits', 'challenges', 'daily_focus', 'daily_affirmations', 'profiles'];
    for (const table of tables) {
      await expoDb.execAsync(`DROP TABLE IF EXISTS ${table};`);
    }
    deleteAllHabitPhotos();
    storage.clearAll();
    initializationPromise = null;
    await ensureDatabaseInitialized();
  } catch (error) {
    console.error('Failed to reset database:', error);
    throw error;
  }
}

export async function initializeDatabase() {
  try {
    expoDb.execSync(`
      CREATE TABLE IF NOT EXISTS profiles (
        id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
        name TEXT,
        avatar TEXT,
        timezone TEXT,
        onboarding_completed INTEGER NOT NULL DEFAULT 0,
        push_token TEXT,
        created_at INTEGER NOT NULL DEFAULT (unixepoch())
      );
    `);

    const profileColumns = expoDb.getAllSync<{ name: string }>(
      `PRAGMA table_info(profiles);`
    );
    const hasAvatar = profileColumns.some((column) => column.name === 'avatar');
    if (!hasAvatar) {
      expoDb.execSync(`
        ALTER TABLE profiles
        ADD COLUMN avatar TEXT;
      `);
    }

    expoDb.execSync(`
      CREATE TABLE IF NOT EXISTS habits (
        id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
        title TEXT NOT NULL,
        subtitle TEXT,
        icon TEXT,
        days_of_week TEXT NOT NULL DEFAULT '[]',
        is_locked INTEGER NOT NULL DEFAULT 0,
        sort_order INTEGER NOT NULL DEFAULT 0,
        archived_at INTEGER,
        created_at INTEGER NOT NULL DEFAULT (unixepoch())
      );
    `);

    expoDb.execSync(`
      CREATE TABLE IF NOT EXISTS challenges (
        id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
        preset_id TEXT NOT NULL,
        title TEXT NOT NULL,
        subtitle TEXT,
        icon TEXT,
        duration_days INTEGER NOT NULL,
        start_date TEXT NOT NULL,
        archived_at INTEGER,
        created_at INTEGER NOT NULL DEFAULT (unixepoch())
      );
    `);

    const habitColumns = expoDb.getAllSync<{ name: string }>(
      `PRAGMA table_info(habits);`
    );
    const hasChallengeId = habitColumns.some((column) => column.name === 'challenge_id');
    if (!hasChallengeId) {
      expoDb.execSync(`
        ALTER TABLE habits
        ADD COLUMN challenge_id INTEGER REFERENCES challenges(id);
      `);
    }

    const hasHabitArchivedAt = habitColumns.some((column) => column.name === 'archived_at');
    if (!hasHabitArchivedAt) {
      expoDb.execSync(`
        ALTER TABLE habits
        ADD COLUMN archived_at INTEGER;
      `);
    }

    const challengeColumns = expoDb.getAllSync<{ name: string }>(
      `PRAGMA table_info(challenges);`
    );
    const hasChallengeArchivedAt = challengeColumns.some(
      (column) => column.name === 'archived_at'
    );
    if (!hasChallengeArchivedAt) {
      expoDb.execSync(`
        ALTER TABLE challenges
        ADD COLUMN archived_at INTEGER;
      `);
    }

    expoDb.execSync(`
      CREATE TABLE IF NOT EXISTS habit_completions (
        id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
        habit_id INTEGER NOT NULL REFERENCES habits(id),
        date TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'done',
        photo_uri TEXT,
        note TEXT,
        created_at INTEGER NOT NULL DEFAULT (unixepoch()),
        UNIQUE(habit_id, date)
      );
    `);

    const completionColumns = expoDb.getAllSync<{ name: string }>(
      `PRAGMA table_info(habit_completions);`
    );
    const hasPhotoUri = completionColumns.some((column) => column.name === 'photo_uri');
    if (!hasPhotoUri) {
      expoDb.execSync(`
        ALTER TABLE habit_completions
        ADD COLUMN photo_uri TEXT;
      `);
    }

    const hasNote = completionColumns.some((column) => column.name === 'note');
    if (!hasNote) {
      expoDb.execSync(`
        ALTER TABLE habit_completions
        ADD COLUMN note TEXT;
      `);
    }

    expoDb.execSync(`
      CREATE TABLE IF NOT EXISTS daily_focus (
        id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
        date TEXT NOT NULL UNIQUE,
        goal TEXT NOT NULL DEFAULT '',
        focus_minutes INTEGER NOT NULL DEFAULT 0,
        completed_at INTEGER,
        video_uri TEXT,
        created_at INTEGER NOT NULL DEFAULT (unixepoch()),
        updated_at INTEGER NOT NULL DEFAULT (unixepoch())
      );
    `);

    const dailyFocusColumns = expoDb.getAllSync<{ name: string }>(
      `PRAGMA table_info(daily_focus);`
    );
    const hasFocusMinutes = dailyFocusColumns.some(
      (column) => column.name === 'focus_minutes'
    );
    if (!hasFocusMinutes) {
      expoDb.execSync(`
        ALTER TABLE daily_focus
        ADD COLUMN focus_minutes INTEGER NOT NULL DEFAULT 0;
      `);
    }

    const hasEveningResetCompletedAt = dailyFocusColumns.some(
      (column) => column.name === 'evening_reset_completed_at'
    );
    if (!hasEveningResetCompletedAt) {
      expoDb.execSync(`
        ALTER TABLE daily_focus
        ADD COLUMN evening_reset_completed_at INTEGER;
      `);
    }

    const hasVideoUri = dailyFocusColumns.some((column) => column.name === 'video_uri');
    if (!hasVideoUri) {
      expoDb.execSync(`
        ALTER TABLE daily_focus
        ADD COLUMN video_uri TEXT;
      `);
    }

    expoDb.execSync(`
      CREATE TABLE IF NOT EXISTS daily_affirmations (
        id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
        date TEXT NOT NULL UNIQUE,
        text TEXT NOT NULL,
        source TEXT NOT NULL DEFAULT 'ai',
        created_at INTEGER NOT NULL DEFAULT (unixepoch()),
        updated_at INTEGER NOT NULL DEFAULT (unixepoch())
      );
    `);
  } catch (error) {
    console.error('Failed to initialize database:', error);
    throw error;
  }
}

export function ensureDatabaseInitialized() {
  if (!initializationPromise) {
    initializationPromise = initializeDatabase();
  }

  return initializationPromise;
}
