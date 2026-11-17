import * as ImagePicker from 'expo-image-picker';
import { Alert } from 'react-native';
import { deleteBackedUpJournalMedia, deleteBackedUpJournalPhoto } from './cloudSync';
import { completionOps, habitOps, journalEntryOps, type JournalEntry } from './db';
import { analyzeMessage } from './journalIntelligence';
import { isAutoOrganizeEnabled } from './journalSettings';
import { foldText } from './journalIntents';
import {
  cancelJournalReminder,
  draftFromEntry,
  ensureReminderPermission,
  mergeTags,
  newLocalId,
  parseJournalEntry,
  syncJournalReminder,
  type JournalAttachment,
  type JournalDraft,
  type ParsedJournalEntry,
} from './journal';
import { deleteJournalMedia, deleteJournalPhoto, persistJournalMedia } from './journalPhotos';

export const MAX_ATTACHMENTS = 20;

// ── Picking attachments ──────────────────────────────────────────────────────

function fromImagePickerAsset(asset: ImagePicker.ImagePickerAsset): JournalAttachment {
  const id = newLocalId();
  const kind = asset.type === 'video' || asset.type === 'pairedVideo' ? 'video' : 'photo';
  const fallbackName = kind === 'video' ? 'video.mov' : 'photo.jpg';
  return {
    id,
    kind,
    uri: persistJournalMedia(asset.uri, id, asset.fileName ?? fallbackName),
    name: asset.fileName ?? null,
    mimeType: asset.mimeType ?? (kind === 'video' ? 'video/quicktime' : 'image/jpeg'),
    size: asset.fileSize ?? null,
    width: asset.width || null,
    height: asset.height || null,
  };
}

/** Opens the camera or library and returns attachments already copied into app storage. */
export async function pickJournalMedia(
  source: 'camera' | 'library',
  remaining: number,
): Promise<JournalAttachment[]> {
  if (remaining <= 0) {
    Alert.alert('Attachment limit', `A message can hold up to ${MAX_ATTACHMENTS} attachments.`);
    return [];
  }
  // The system library picker grants access only to the chosen items; it does
  // not require broad library access (including when grid access was denied).
  if (source === 'camera') {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Camera access needed', 'Enable camera access in Settings to take photos and videos.');
      return [];
    }
  }

  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ['images', 'videos'],
    allowsEditing: false,
    quality: 0.7,
    videoMaxDuration: 600,
    ...(source === 'library'
      ? { allowsMultipleSelection: true, selectionLimit: remaining, orderedSelection: true }
      : {}),
  };
  const result =
    source === 'camera'
      ? await ImagePicker.launchCameraAsync(options)
      : await ImagePicker.launchImageLibraryAsync(options);
  if (result.canceled || !result.assets?.length) return [];
  return result.assets.slice(0, remaining).map(fromImagePickerAsset);
}

/** Removes local copies for attachments that were picked but never saved. */
export function discardAttachments(attachments: JournalAttachment[]) {
  for (const attachment of attachments) deleteJournalMedia(attachment.uri);
}

// ── Saving / deleting ────────────────────────────────────────────────────────

function dateFromKey(key: string): Date {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day, 12);
}

/** Ticks the habit for the message's day (keeping any existing check-in photo/note). */
async function logHabit(habitId: number, dateKey: string) {
  try {
    await completionOps.markDoneKeepingCheckIn(habitId, dateFromKey(dateKey));
  } catch (error) {
    console.warn('Failed to log habit from journal:', error);
  }
}

// Each edit/delete/correction invalidates results that are still in flight.
const analysisJobs = new Map<number, symbol>();
function invalidateAnalysis(id: number) {
  const pending = analysisJobs.has(id);
  analysisJobs.delete(id);
  return pending;
}

function analyzeInBackground(row: JournalEntry, referenceDate = new Date()) {
  if (!isAutoOrganizeEnabled()) return;
  const token = Symbol();
  analysisJobs.set(row.id, token);
  const current = () => analysisJobs.get(row.id) === token && isAutoOrganizeEnabled();
  const previous = parseJournalEntry(row);
  void (async () => {
    try {
      const [habits, rows] = await Promise.all([habitOps.getAll(), journalEntryOps.getAll()]);
      if (!current()) return;
      const knownTags = mergeTags(...rows.map((item) => parseJournalEntry(item).tags));
      const result = await analyzeMessage({
        text: previous.note, habits, knownTags, attachments: previous.attachments, now: referenceDate,
      });
      if (!current()) return;
      // Don't request permissions or apply actions for a deleted/replaced message.
      const saved = await journalEntryOps.getById(row.id);
      if (!current() || !saved || JSON.stringify(saved) !== JSON.stringify(row)) return;
      let remindAt = result.remindAt;
      let notice: string | null = result.reminderRequested && !remindAt
        ? 'Your message is saved, but the reminder needs a clear future date and time. Edit the message, for example: “Remind me tomorrow at 8 AM to call Mum.”'
        : null;
      if (remindAt && !(await ensureReminderPermission())) {
        remindAt = null;
        notice = 'Your message is saved, but notifications are off. Enable notifications in Settings, then send the reminder again.';
      }
      if (!current()) return;
      // A relative reminder can expire while the model or permission prompt is open.
      if (remindAt && remindAt.getTime() <= Date.now()) {
        remindAt = null;
        notice = 'Your message is saved, but the reminder time has passed. Edit the message with a future time.';
      }
      const checklist = result.checklist.map((item) => {
        const existing = previous.checklist.find((old) => foldText(old.text.trim()) === foldText(item.text));
        return { id: existing?.id ?? newLocalId(), text: item.text, done: existing?.done ?? item.done };
      });
      const [updated] = await journalEntryOps.setAnalysis(row.id, row, {
        habitId: result.habitId, checklist, remindAt, autoTags: result.tags,
      });
      if (!current() || !updated) return;
      const entry = parseJournalEntry(updated);
      if (entry.habitId && entry.habitId !== previous.habitId) await logHabit(entry.habitId, entry.date);
      if (!current()) return;
      if (entry.remindAt || previous.remindAt) await syncJournalReminder(entry);
      if (current() && notice) Alert.alert('Reminder', notice);
    } catch (error) {
      // The original message is already saved even if understanding fails.
      console.info('Journal background understanding failed:', error);
    } finally {
      if (analysisJobs.get(row.id) === token) analysisJobs.delete(row.id);
    }
  })();
}

export async function createJournalMessage(draft: JournalDraft): Promise<ParsedJournalEntry | null> {
  const referenceDate = new Date();
  const [row] = await journalEntryOps.create(draft);
  if (!row) return null;
  analyzeInBackground(row, referenceDate);
  return parseJournalEntry(row);
}

/** Save first; inference updates only this version of the message in the background. */
export async function updateJournalMessage(previous: ParsedJournalEntry, draft: JournalDraft) {
  const referenceDate = new Date();
  const wasPending = invalidateAnalysis(previous.id);
  const textChanged = draft.note.trim() !== previous.note.trim();
  const [row] = await journalEntryOps.update(previous.id, draft);
  if (!row) return null;
  const keptIds = new Set(draft.attachments.map((a) => a.id));
  const removed = previous.attachments.filter((a) => !keptIds.has(a.id));
  discardAttachments(removed);
  deleteBackedUpJournalMedia(previous.id, removed.map((a) => a.id));
  if (previous.photoUri && !draft.photoUri) {
    deleteJournalPhoto(previous.photoUri);
    deleteBackedUpJournalPhoto(previous.id);
  }
  if (textChanged || wasPending) analyzeInBackground(row, referenceDate);
  return parseJournalEntry(row);
}

/** Unlinks the habit; optionally also unticks it for that day. */
export async function unlinkJournalHabit(entry: ParsedJournalEntry, alsoUncheck: boolean) {
  invalidateAnalysis(entry.id);
  if (!entry.habitId) return;
  await journalEntryOps.setHabit(entry.id, null);
  if (alsoUncheck) await completionOps.markUndone(entry.habitId, dateFromKey(entry.date));
}

export async function deleteJournalMessage(entry: ParsedJournalEntry) {
  invalidateAnalysis(entry.id);
  await cancelJournalReminder(entry.id);
  await journalEntryOps.delete(entry.id);
  discardAttachments(entry.attachments);
  deleteBackedUpJournalMedia(entry.id, entry.attachments.map((a) => a.id));
  if (entry.photoUri) {
    deleteJournalPhoto(entry.photoUri);
    deleteBackedUpJournalPhoto(entry.id);
  }
}

export async function setJournalReminder(entry: ParsedJournalEntry, remindAt: Date | null) {
  invalidateAnalysis(entry.id);
  const updated = await journalEntryOps.update(entry.id, { ...draftFromEntry(entry), remindAt });
  if (updated[0]) await syncJournalReminder(parseJournalEntry(updated[0]));
}

export async function toggleChecklistItem(entry: ParsedJournalEntry, itemId: string) {
  invalidateAnalysis(entry.id);
  const checklist = entry.checklist.map((item) =>
    item.id === itemId ? { ...item, done: !item.done } : item,
  );
  await journalEntryOps.setChecklist(entry.id, checklist);
}
