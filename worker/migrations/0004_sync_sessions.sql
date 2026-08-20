CREATE TABLE IF NOT EXISTS sync_sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sync_sessions_expires_at ON sync_sessions(expires_at);
