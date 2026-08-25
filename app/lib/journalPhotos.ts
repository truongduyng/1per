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
