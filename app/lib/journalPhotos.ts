import { Directory, File, Paths } from 'expo-file-system';

// Freestyle journal entry photos, stored the same way as habit check-in photos
// (copied into the document directory so they survive cache clears) but in
// their own subdirectory since they aren't tied to a habit.
const PHOTO_DIR_NAME = 'journal-photos';

function photosDirectory(): Directory {
  const dir = new Directory(Paths.document, PHOTO_DIR_NAME);
  if (!dir.exists) {
    dir.create({ intermediates: true, idempotent: true });
  }
  return dir;
}

function extensionOf(uri: string): string {
  const name = uri.split('?')[0].split('/').pop() ?? '';
  const ext = name.includes('.') ? name.split('.').pop()! : '';
  return /^[a-zA-Z0-9]{1,5}$/.test(ext) ? ext.toLowerCase() : 'jpg';
}

/** Copies a picked image into permanent storage and returns its file:// URI. */
export function persistJournalPhoto(sourceUri: string, dateKey: string): string {
  try {
    const dest = new File(
      photosDirectory(),
      `journal-${dateKey}-${Date.now()}.${extensionOf(sourceUri)}`,
    );
    new File(sourceUri).copy(dest);
    return dest.uri;
  } catch (error) {
    console.warn('Failed to store journal photo:', error);
    return sourceUri;
  }
}

/** Best-effort removal of a stored journal photo. Never throws. */
export function deleteJournalPhoto(uri?: string | null) {
  if (!uri || !uri.includes(PHOTO_DIR_NAME)) return;
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch (error) {
    console.warn('Failed to delete journal photo:', error);
  }
}

/** Removes every stored journal photo. Used when the user resets all data. */
export function deleteAllJournalPhotos() {
  try {
    const dir = new Directory(Paths.document, PHOTO_DIR_NAME);
    if (dir.exists) dir.delete();
  } catch (error) {
    console.warn('Failed to clear journal photos:', error);
  }
}

// ── Entry attachments (photos, videos, files) ────────────────────────────────
// Each attachment is copied into its own file under `journal-media/` so it
// survives cache clears and the picker's temp files being purged.
const MEDIA_DIR_NAME = 'journal-media';

function mediaDirectory(): Directory {
  const dir = new Directory(Paths.document, MEDIA_DIR_NAME);
  if (!dir.exists) {
    dir.create({ intermediates: true, idempotent: true });
  }
  return dir;
}

/** Copies a picked photo/video/file into permanent storage and returns its file:// URI. */
export function persistJournalMedia(sourceUri: string, attachmentId: string, fileName?: string | null): string {
  try {
    const ext = extensionOf(fileName || sourceUri);
    const dest = new File(mediaDirectory(), `${attachmentId}.${ext}`);
    if (dest.exists) dest.delete();
    new File(sourceUri).copy(dest);
    return dest.uri;
  } catch (error) {
    console.warn('Failed to store journal attachment:', error);
    return sourceUri;
  }
}

/** Best-effort removal of a stored attachment. Never throws. */
export function deleteJournalMedia(uri?: string | null) {
  if (!uri || !uri.includes(MEDIA_DIR_NAME)) return;
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch (error) {
    console.warn('Failed to delete journal attachment:', error);
  }
}

/** Directory name used when restoring attachments from a cloud backup. */
export const JOURNAL_MEDIA_DIR_NAME = MEDIA_DIR_NAME;

/** Removes every stored attachment. Used when the user resets all data. */
export function deleteAllJournalMedia() {
  try {
    const dir = new Directory(Paths.document, MEDIA_DIR_NAME);
    if (dir.exists) dir.delete();
  } catch (error) {
    console.warn('Failed to clear journal attachments:', error);
  }
}
