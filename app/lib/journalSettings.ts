import { storage, STORAGE_KEYS } from './storage';

/** Infer habits, checklists, reminders and topic tags for journal messages (on by default). */
export function isAutoOrganizeEnabled(): boolean {
  return storage.getBoolean(STORAGE_KEYS.JOURNAL_AUTO_ORGANIZE) ?? true;
}

export function setAutoOrganizeEnabled(enabled: boolean) {
  storage.set(STORAGE_KEYS.JOURNAL_AUTO_ORGANIZE, enabled);
}
