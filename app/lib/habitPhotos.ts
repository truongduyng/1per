import { Directory, File, Paths } from 'expo-file-system';

// Check-in photos are copied out of the picker's cache into the app's document
// directory so they survive the OS clearing caches. They stay on-device — like
// every other piece of user data in this app, nothing is uploaded.
const PHOTO_DIR_NAME = 'habit-photos';

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

/**
 * Copies a picked image into permanent storage and returns its file:// URI.
 * Falls back to the original URI if the copy fails, so a check-in is never
 * blocked by a filesystem hiccup.
 */
export function persistHabitPhoto(sourceUri: string, habitId: number, dateKey: string): string {
  try {
    const dest = new File(
      photosDirectory(),
      `habit-${habitId}-${dateKey}-${Date.now()}.${extensionOf(sourceUri)}`,
    );
    new File(sourceUri).copy(dest);
    return dest.uri;
  } catch (error) {
    console.warn('Failed to store habit photo:', error);
    return sourceUri;
  }
}

/** Best-effort removal of a stored check-in photo. Never throws. */
export function deleteHabitPhoto(uri?: string | null) {
  if (!uri || !uri.includes(PHOTO_DIR_NAME)) return;
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch (error) {
    console.warn('Failed to delete habit photo:', error);
  }
}

/** Removes every stored check-in photo. Used when the user resets all data. */
export function deleteAllHabitPhotos() {
  try {
    const dir = new Directory(Paths.document, PHOTO_DIR_NAME);
    if (dir.exists) dir.delete();
  } catch (error) {
    console.warn('Failed to clear habit photos:', error);
  }
}
