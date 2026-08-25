import {
  createSyncSession,
  deleteMedia,
  downloadCloudSnapshot,
  downloadMedia,
  uploadCloudSnapshot,
  uploadMedia,
  type MediaKind,
} from "./backend";
import { getSessionToken, loadSessionToken, setSessionToken, signInWithApple } from "./appleAuth";
import { exportSnapshot, importSnapshot, type DataSnapshot } from "./db/snapshot";
import { subscribeToDataChanges } from "./db/changeListener";
import { storage, STORAGE_KEYS } from "./storage";
import { Directory, File, Paths } from "expo-file-system";
import { db, dailyFocus, habitCompletions, journalEntries } from "./db";
import { eq } from "drizzle-orm";

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
  await restoreMediaFiles();
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
    await restoreMediaFiles();
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
    await restoreMediaFiles();
  } else {
    await signInAndRestore();
  }
}

export async function syncNow() {
  const token = getSessionToken();
  if (!token || syncInFlight) return syncInFlight;
  syncInFlight = uploadCloudSnapshot(token, await exportSnapshot())
    .then(async () => {
      storage.set(STORAGE_KEYS.LAST_BACKUP_AT, new Date().toISOString());
      await backupMediaFiles();
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

// Uploads every local media file referenced by the DB. Runs as part of the
// regular backup cycle rather than at save time, since R2 PUT overwrites are
// idempotent and re-uploading unchanged files is cheap and simple.
async function backupMediaFiles() {
  const token = getSessionToken();
  if (!token) return;

  const focusRows = await db.select().from(dailyFocus);
  for (const row of focusRows) {
    if (row.videoUri) await backupMedia("focus", row.date, row.videoUri);
  }

  const habitPhotoRows = await db.select().from(habitCompletions);
  for (const row of habitPhotoRows) {
    if (row.photoUri) await backupMedia("habit-photo", String(row.id), row.photoUri);
  }

  const journalPhotoRows = await db.select().from(journalEntries);
  for (const row of journalPhotoRows) {
    if (row.photoUri) await backupMedia("journal-photo", String(row.id), row.photoUri);
  }
}

// Best-effort: never blocks or throws into the caller's flow, since local
// storage (not the cloud copy) is the source of truth.
async function backupMedia(kind: MediaKind, id: string, fileUri: string) {
  const token = getSessionToken();
  if (!token) return;
  if (!new File(fileUri).exists) return;
  try {
    await uploadMedia(token, kind, id, fileUri);
  } catch (error) {
    console.warn(`Failed to back up ${kind} media:`, error);
  }
}

export function deleteBackedUpHabitPhoto(id: number) {
  const token = getSessionToken();
  if (!token) return;
  void deleteMedia(token, "habit-photo", String(id)).catch(() => {});
}

export function deleteBackedUpJournalPhoto(id: number) {
  const token = getSessionToken();
  if (!token) return;
  void deleteMedia(token, "journal-photo", String(id)).catch(() => {});
}

// After restoring a snapshot on a fresh install, local file:// URIs recorded
// in the DB no longer point to real files. Re-download anything backed up
// and rewrite the URI to a fresh local copy; drop the reference otherwise.
export async function restoreMediaFiles() {
  const token = getSessionToken();
  if (!token) return;

  const focusRows = await db.select().from(dailyFocus);
  for (const row of focusRows) {
    if (!row.videoUri) continue;
    await restoreOne("focus", row.date, row.videoUri, "focus-videos", `focus-${row.date}.mp4`, async (uri) => {
      await db.update(dailyFocus).set({ videoUri: uri ?? null }).where(eq(dailyFocus.date, row.date));
    });
  }

  const habitPhotoRows = await db.select().from(habitCompletions);
  for (const row of habitPhotoRows) {
    if (!row.photoUri) continue;
    await restoreOne("habit-photo", String(row.id), row.photoUri, "habit-photos", `habit-${row.id}.jpg`, async (uri) => {
      await db.update(habitCompletions).set({ photoUri: uri ?? null }).where(eq(habitCompletions.id, row.id));
    });
  }

  const journalPhotoRows = await db.select().from(journalEntries);
  for (const row of journalPhotoRows) {
    if (!row.photoUri) continue;
    await restoreOne("journal-photo", String(row.id), row.photoUri, "journal-photos", `journal-${row.id}.jpg`, async (uri) => {
      await db.update(journalEntries).set({ photoUri: uri ?? null }).where(eq(journalEntries.id, row.id));
    });
  }
}

async function restoreOne(
  kind: MediaKind,
  id: string,
  currentUri: string,
  dirName: string,
  fileName: string,
  setUri: (uri: string | null) => Promise<void>,
) {
  const token = getSessionToken();
  if (!token) return;
  if (new File(currentUri).exists) return; // local file already present, nothing to do

  try {
    const dir = new Directory(Paths.document, dirName);
    if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
    const dest = new File(dir, fileName);
    const found = await downloadMedia(token, kind, id, dest.uri);
    await setUri(found ? dest.uri : null);
  } catch (error) {
    console.warn(`Failed to restore ${kind} media:`, error);
  }
}
