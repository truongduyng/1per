import { storage, STORAGE_KEYS } from './storage';

/** Infer habits, checklists, reminders and topic tags for journal messages (on by default). */
export function isAutoOrganizeEnabled(): boolean {
  return storage.getBoolean(STORAGE_KEYS.JOURNAL_AUTO_ORGANIZE) ?? true;
}

export function setAutoOrganizeEnabled(enabled: boolean) {
  storage.set(STORAGE_KEYS.JOURNAL_AUTO_ORGANIZE, enabled);
}

/** Language the journal mic transcribes in. "auto" follows the device's preferred language. */
export type DictationLanguage = 'auto' | 'en-US' | 'vi-VN';

export const DICTATION_LANGUAGE_OPTIONS: { value: DictationLanguage; label: string }[] = [
  { value: 'auto', label: 'Auto' },
  { value: 'en-US', label: 'English' },
  { value: 'vi-VN', label: 'Tiếng Việt' },
];

export function getDictationLanguage(): DictationLanguage {
  const stored = storage.getString(STORAGE_KEYS.JOURNAL_DICTATION_LANG);
  return DICTATION_LANGUAGE_OPTIONS.some((o) => o.value === stored)
    ? (stored as DictationLanguage)
    : 'auto';
}

export function setDictationLanguage(lang: DictationLanguage) {
  storage.set(STORAGE_KEYS.JOURNAL_DICTATION_LANG, lang);
}
