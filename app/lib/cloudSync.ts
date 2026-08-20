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

// First sign-in: restores an existing cloud backup for this Apple account if
// there is one, otherwise backs up the local data as the initial snapshot.
// Used by onboarding, where local data is fresh and safe to replace.
export async function signInAndSync() {
  const identity = await signInWithApple();
  await setSessionToken(await createSyncSession(identity.identityToken));
  const token = getSessionToken();
  if (!token) throw new Error("Apple sign-in did not return a token.");
  const remote = await downloadCloudSnapshot(token);
  if (remote) {
    await importSnapshot(remote as DataSnapshot);
  } else {
    await syncNow();
  }
  return { identity, restored: !!remote };
}

// Backs up with the existing session when signed in, only prompting Apple sign-in otherwise.
export async function backupNow() {
  if (await hasCloudSession()) {
    await syncNow();
  } else {
    await signInAndBackup();
  }
}

// Restores with the existing session when signed in, only prompting Apple sign-in otherwise.
export async function restoreNow() {
  if (await hasCloudSession()) {
    const token = getSessionToken();
    if (!token) throw new Error("Not signed in.");
    const remote = await downloadCloudSnapshot(token);
    if (!remote) throw new Error("No cloud backup exists for this Apple account.");
    await importSnapshot(remote as DataSnapshot);
  } else {
    await signInAndRestore();
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
