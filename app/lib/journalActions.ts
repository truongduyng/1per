import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { Alert } from 'react-native';
import { deleteBackedUpJournalMedia, deleteBackedUpJournalPhoto } from './cloudSync';
import { journalEntryOps } from './db';
import {
  cancelJournalReminder,
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
  const permission =
    source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    Alert.alert(
      source === 'camera' ? 'Camera access needed' : 'Photo access needed',
      'Enable access in Settings to attach photos and videos.',
    );
    return [];
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

export async function pickJournalFiles(remaining: number): Promise<JournalAttachment[]> {
  if (remaining <= 0) {
    Alert.alert('Attachment limit', `A message can hold up to ${MAX_ATTACHMENTS} attachments.`);
    return [];
  }
  const result = await DocumentPicker.getDocumentAsync({
    multiple: true,
    copyToCacheDirectory: true,
  });
  if (result.canceled || !result.assets?.length) return [];
  return result.assets.slice(0, remaining).map((asset) => {
    const id = newLocalId();
    const mime = asset.mimeType ?? null;
    // Images/videos sent as files still render inline.
    const kind = mime?.startsWith('image/') ? 'photo' : mime?.startsWith('video/') ? 'video' : 'file';
    return {
      id,
      kind,
      uri: persistJournalMedia(asset.uri, id, asset.name),
      name: asset.name,
      mimeType: mime,
      size: asset.size ?? null,
    } satisfies JournalAttachment;
  });
}

/** Removes local copies for attachments that were picked but never saved. */
export function discardAttachments(attachments: JournalAttachment[]) {
  for (const attachment of attachments) deleteJournalMedia(attachment.uri);
}

// ── Saving / deleting ────────────────────────────────────────────────────────

export async function createJournalMessage(draft: JournalDraft): Promise<ParsedJournalEntry | null> {
  const [row] = await journalEntryOps.create(draft);
  if (!row) return null;
  const entry = parseJournalEntry(row);
  if (entry.remindAt) await syncJournalReminder(entry);
  return entry;
}

/** Saves edits and cleans up files/backups for attachments the edit removed. */
export async function updateJournalMessage(previous: ParsedJournalEntry, draft: JournalDraft) {
  const [row] = await journalEntryOps.update(previous.id, draft);
  const keptIds = new Set(draft.attachments.map((a) => a.id));
  const removed = previous.attachments.filter((a) => !keptIds.has(a.id));
  discardAttachments(removed);
  deleteBackedUpJournalMedia(previous.id, removed.map((a) => a.id));
  if (previous.photoUri && !draft.photoUri) {
    deleteJournalPhoto(previous.photoUri);
    deleteBackedUpJournalPhoto(previous.id);
  }
  if (row) await syncJournalReminder(parseJournalEntry(row));
  return row ? parseJournalEntry(row) : null;
}

export async function deleteJournalMessage(entry: ParsedJournalEntry) {
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
  const updated = await journalEntryOps.update(entry.id, {
    note: entry.note,
    photoUri: entry.photoUri,
    tags: entry.tags,
    links: entry.links,
    attachments: entry.attachments,
    checklist: entry.checklist,
    remindAt,
  });
  if (updated[0]) await syncJournalReminder(parseJournalEntry(updated[0]));
}

export async function toggleChecklistItem(entry: ParsedJournalEntry, itemId: string) {
  const checklist = entry.checklist.map((item) =>
    item.id === itemId ? { ...item, done: !item.done } : item,
  );
  await journalEntryOps.setChecklist(entry.id, checklist);
}

// ── Reminder presets ─────────────────────────────────────────────────────────

export function reminderPresets(now = new Date()): { label: string; date: Date }[] {
  const at = (daysAhead: number, hour: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() + daysAhead);
    d.setHours(hour, 0, 0, 0);
    return d;
  };
  const inOneHour = new Date(now.getTime() + 60 * 60 * 1000);
  inOneHour.setSeconds(0, 0);
  const presets = [{ label: 'In 1 hour', date: inOneHour }];
  const tonight = at(0, 20);
  if (tonight.getTime() - now.getTime() > 60 * 60 * 1000) {
    presets.push({ label: 'Tonight, 8 PM', date: tonight });
  }
  presets.push({ label: 'Tomorrow, 9 AM', date: at(1, 9) });
  // Next Monday morning (or a week out if today is Monday).
  const daysToMonday = ((8 - now.getDay()) % 7) || 7;
  presets.push({ label: 'Next week', date: at(daysToMonday, 9) });
  return presets;
}
