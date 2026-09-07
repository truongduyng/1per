import { Directory, File, Paths } from 'expo-file-system';

// The profile avatar photo is copied out of the picker's cache into the app's
// document directory so it survives the OS clearing caches. It stays
// on-device - like every other piece of user data in this app, nothing is
// uploaded.
const AVATAR_DIR_NAME = 'avatar-photos';

function avatarDirectory(): Directory {
  const dir = new Directory(Paths.document, AVATAR_DIR_NAME);
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
 * Falls back to the original URI if the copy fails, so picking an avatar is
 * never blocked by a filesystem hiccup.
 */
export function persistAvatarPhoto(sourceUri: string): string {
  try {
    const dest = new File(avatarDirectory(), `avatar-${Date.now()}.${extensionOf(sourceUri)}`);
    new File(sourceUri).copy(dest);
    return dest.uri;
  } catch (error) {
    console.warn('Failed to store avatar photo:', error);
    return sourceUri;
  }
}

/** Best-effort removal of a previously stored avatar photo. Never throws. */
export function deleteAvatarPhoto(uri?: string | null) {
  if (!uri || !uri.includes(AVATAR_DIR_NAME)) return;
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch (error) {
    console.warn('Failed to delete avatar photo:', error);
  }
}

/** Whether a stored avatar value is a photo (as opposed to a legacy icon name). */
export function isAvatarPhotoUri(value?: string | null): boolean {
  return Boolean(value && value.includes(AVATAR_DIR_NAME));
}
