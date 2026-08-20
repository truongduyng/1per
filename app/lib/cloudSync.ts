import { createSyncSession, downloadCloudSnapshot, uploadCloudSnapshot } from "./backend";
import { getSessionToken, loadSessionToken, setSessionToken, signInWithApple } from "./appleAuth";
import { exportSnapshot, importSnapshot, type DataSnapshot } from "./db/snapshot";
import { subscribeToDataChanges } from "./db/changeListener";

let syncTimer: ReturnType<typeof setTimeout> | null = null;
let syncInFlight: Promise<void> | null = null;

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

export async function syncNow() {
  const token = getSessionToken();
  if (!token || syncInFlight) return syncInFlight;
  syncInFlight = uploadCloudSnapshot(token, await exportSnapshot())
    .then(() => undefined)
    .finally(() => { syncInFlight = null; });
  return syncInFlight;
}

export function startCloudSyncListener() {
  void loadSessionToken();
  return subscribeToDataChanges(() => {
    if (syncTimer) clearTimeout(syncTimer);
    syncTimer = setTimeout(() => { void syncNow(); }, 1500);
  });
}
