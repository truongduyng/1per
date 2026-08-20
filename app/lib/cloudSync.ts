import { createSyncSession, downloadCloudSnapshot, uploadCloudSnapshot } from "./backend";
import { getSessionToken, loadSessionToken, setSessionToken, signInWithApple } from "./appleAuth";
import { exportSnapshot, importSnapshot, type DataSnapshot } from "./db/snapshot";
import { subscribeToDataChanges } from "./db/changeListener";
import { storage, STORAGE_KEYS } from "./storage";

let syncTimer: ReturnType<typeof setTimeout> | null = null;
let syncInFlight: Promise<void> | null = null;
let sessionLoaded: Promise<string | null> | null = null;

export function getLastBackupAt(): Date | null {
  const stored = storage.getString(STORAGE_KEYS.LAST_BACKUP_AT);
  return stored ? new Date(stored) : null;
}

// Resolves once the persisted session token (if any) has been loaded into memory.
export function ensureSessionLoaded() {
  if (!sessionLoaded) sessionLoaded = loadSessionToken();
  return sessionLoaded;
}

export async function hasCloudSession() {
  await ensureSessionLoaded();
  return !!getSessionToken();
}

export async function signInAndRestore() {
  const identity = await signInWithApple();
  await setSessionToken(await createSyncSession(identity.identityToken));
  const token = getSessionToken();
  if (!token) throw new Error("Apple sign-in did not return a token.");
  const remote = await downloadCloudSnapshot(token);
  if (!remote) throw new Error("No cloud backup exists for this Apple account.");
  await importSnapshot(remote as DataSnapshot);
  return identity;
}

export async function signInAndBackup() {
  const identity = await signInWithApple();
  await setSessionToken(await createSyncSession(identity.identityToken));
  await syncNow();
}

// Backs up with the existing session when signed in, only prompting Apple sign-in otherwise.
export async function backupNow() {
  if (await hasCloudSession()) {
    await syncNow();
  } else {
    await signInAndBackup();
  }
}

export async function syncNow() {
  const token = getSessionToken();
  if (!token || syncInFlight) return syncInFlight;
  syncInFlight = uploadCloudSnapshot(token, await exportSnapshot())
    .then(() => {
      storage.set(STORAGE_KEYS.LAST_BACKUP_AT, new Date().toISOString());
    })
    .finally(() => { syncInFlight = null; });
  return syncInFlight;
}

export function startCloudSyncListener() {
  void ensureSessionLoaded();
  return subscribeToDataChanges(() => {
    if (syncTimer) clearTimeout(syncTimer);
    syncTimer = setTimeout(() => { void syncNow(); }, 1500);
  });
}
