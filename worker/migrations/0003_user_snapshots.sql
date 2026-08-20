CREATE TABLE IF NOT EXISTS user_snapshots (
  user_id TEXT PRIMARY KEY,
  snapshot TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
