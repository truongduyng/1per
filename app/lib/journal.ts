import * as Notifications from 'expo-notifications';
import type { JournalEntry } from './db/schema';

// ── Shapes stored as JSON in journal_entries ─────────────────────────────────

export type JournalAttachmentKind = 'photo' | 'video' | 'file';

export interface JournalAttachment {
  id: string;                 // short [a-zA-Z0-9] id, also used for the stored file name / backup key
  kind: JournalAttachmentKind;
  uri: string;                // local file:// URI
  name?: string | null;       // original file name (files) for display + search
  mimeType?: string | null;
  size?: number | null;       // bytes
  width?: number | null;
  height?: number | null;
}

export interface JournalChecklistItem {
  id: string;
  text: string;
  done: boolean;
}

/** A journal row with its JSON columns decoded. */
export interface ParsedJournalEntry {
  id: number;
  date: string;
  note: string;
  photoUri: string | null;    // legacy single photo
  tags: string[];
  links: string[];
  attachments: JournalAttachment[];
  checklist: JournalChecklistItem[];
  remindAt: Date | null;
  createdAt: Date;
  updatedAt: Date | null;
}

export interface JournalDraft {
  note: string;
  photoUri: string | null;
  tags: string[];
  links: string[];
  attachments: JournalAttachment[];
  checklist: JournalChecklistItem[];
  remindAt: Date | null;
}

export function emptyJournalDraft(): JournalDraft {
  return {
    note: '',
    photoUri: null,
    tags: [],
    links: [],
    attachments: [],
    checklist: [],
    remindAt: null,
  };
}

export function newLocalId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function parseArray<T>(raw: string | null | undefined, isItem: (v: unknown) => v is T): T[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isItem) : [];
  } catch {
    return [];
  }
}

const isString = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
const isAttachment = (v: unknown): v is JournalAttachment =>
  !!v && typeof v === 'object' &&
  typeof (v as JournalAttachment).id === 'string' &&
  typeof (v as JournalAttachment).uri === 'string' &&
  ['photo', 'video', 'file'].includes((v as JournalAttachment).kind);
const isChecklistItem = (v: unknown): v is JournalChecklistItem =>
  !!v && typeof v === 'object' &&
  typeof (v as JournalChecklistItem).id === 'string' &&
  typeof (v as JournalChecklistItem).text === 'string';

export function parseJournalEntry(row: JournalEntry): ParsedJournalEntry {
  return {
    id: row.id,
    date: row.date,
    note: row.note ?? '',
    photoUri: row.photoUri ?? null,
    tags: parseArray(row.tags, isString),
    links: parseArray(row.links, isString),
    attachments: parseArray(row.attachments, isAttachment),
    checklist: parseArray(row.checklist, isChecklistItem).map((item) => ({ ...item, done: !!item.done })),
    remindAt: row.remindAt ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt ?? null,
  };
}

export function draftFromEntry(entry: ParsedJournalEntry): JournalDraft {
  return {
    note: entry.note,
    photoUri: entry.photoUri,
    tags: [...entry.tags],
    links: [...entry.links],
    attachments: entry.attachments.map((a) => ({ ...a })),
    checklist: entry.checklist.map((c) => ({ ...c })),
    remindAt: entry.remindAt,
  };
}

export function encodeJsonArray(values: unknown[]): string | null {
  return values.length ? JSON.stringify(values) : null;
}

// ── Tags ─────────────────────────────────────────────────────────────────────

export const TAG_MAX_LENGTH = 32;

/** Lowercases, strips a leading '#', and collapses whitespace to '-'. */
export function normalizeTag(raw: string): string {
  return raw
    .trim()
    .replace(/^#+/, '')
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\p{L}\p{N}_-]/gu, '')
    .slice(0, TAG_MAX_LENGTH);
}

/** `#hashtags` written inline in a note, so typing them is enough to tag an entry. */
export function extractHashtags(text: string): string[] {
  const found = new Set<string>();
  for (const match of text.matchAll(/(^|[^\p{L}\p{N}_&/])#([\p{L}\p{N}_-]+)/gu)) {
    const tag = normalizeTag(match[2]);
    // Skip pure numbers ("#1") - they're almost always rankings, not tags.
    if (tag && !/^\d+$/.test(tag)) found.add(tag);
  }
  return [...found];
}

export function mergeTags(...lists: string[][]): string[] {
  const out: string[] = [];
  for (const list of lists) {
    for (const raw of list) {
      const tag = normalizeTag(raw);
      if (tag && !out.includes(tag)) out.push(tag);
    }
  }
  return out;
}

// ── Links ────────────────────────────────────────────────────────────────────

/** Returns a normalized http(s) URL, or null if the input doesn't look like one. */
export function normalizeLink(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed || /\s/.test(trimmed)) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  if (!/^https?:\/\//i.test(withScheme)) return null;
  const host = withScheme.replace(/^https?:\/\//i, '').split(/[/?#]/)[0];
  if (!host || !/^[^.]+(\.[^.]+)+$|^localhost(:\d+)?$/i.test(host)) return null;
  return withScheme;
}

/** Short display form: host + path, no scheme or trailing slash. */
export function displayLink(url: string): string {
  return url.replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/$/, '');
}

export function extractLinks(text: string): string[] {
  const out: string[] = [];
  for (const match of text.matchAll(/\bhttps?:\/\/[^\s<>"')\]]+/gi)) {
    const url = normalizeLink(match[0].replace(/[.,;:!?]+$/, ''));
    if (url && !out.includes(url)) out.push(url);
  }
  return out;
}

// ── Search ───────────────────────────────────────────────────────────────────

export type JournalFilter =
  | 'all'
  | 'photos'
  | 'videos'
  | 'files'
  | 'links'
  | 'checklists'
  | 'reminders';

export function journalEntryHaystack(entry: ParsedJournalEntry): string {
  return [
    entry.note,
    entry.tags.map((t) => `#${t}`).join(' '),
    entry.links.join(' '),
    entry.checklist.map((c) => c.text).join(' '),
    entry.attachments.map((a) => a.name ?? '').join(' '),
  ]
    .join('\n')
    .toLowerCase();
}

/**
 * Every whitespace-separated term must appear somewhere (AND search).
 * `#tag` terms must match a tag exactly-by-prefix rather than any text.
 */
export function matchesQuery(haystack: string, tags: string[], query: string): boolean {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  return terms.every((term) => {
    if (term.startsWith('#') && term.length > 1) {
      const wanted = normalizeTag(term);
      return tags.some((t) => t.startsWith(wanted));
    }
    return haystack.includes(term);
  });
}

export function journalEntryMatchesFilter(entry: ParsedJournalEntry, filter: JournalFilter): boolean {
  switch (filter) {
    case 'all':
      return true;
    case 'photos':
      return !!entry.photoUri || entry.attachments.some((a) => a.kind === 'photo');
    case 'videos':
      return entry.attachments.some((a) => a.kind === 'video');
    case 'files':
      return entry.attachments.some((a) => a.kind === 'file');
    case 'links':
      return entry.links.length > 0;
    case 'checklists':
      return entry.checklist.length > 0;
    case 'reminders':
      return !!entry.remindAt;
  }
}

export function formatFileSize(bytes?: number | null): string {
  if (!bytes || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ── Reminders ────────────────────────────────────────────────────────────────
// Each entry owns at most one local notification, keyed by a stable identifier
// so rescheduling replaces it and no notification id needs to be stored.

const REMINDER_PREFIX = 'journal-reminder-';

export function journalReminderIdentifier(entryId: number) {
  return `${REMINDER_PREFIX}${entryId}`;
}

export async function ensureReminderPermission(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.status === 'granted') return true;
  if (!current.canAskAgain) return false;
  const requested = await Notifications.requestPermissionsAsync();
  return requested.status === 'granted';
}

function reminderContent(entry: Pick<ParsedJournalEntry, 'id' | 'note' | 'checklist'>) {
  const open = entry.checklist.filter((c) => !c.done).length;
  const body =
    entry.note.trim().split('\n')[0]?.slice(0, 140) ||
    (open ? `${open} open checklist item${open === 1 ? '' : 's'}` : 'Tap to open your journal entry.');
  return {
    title: 'Journal reminder',
    body,
    sound: 'default' as const,
    data: { journalEntryId: entry.id, url: `/journal?entry=${entry.id}` },
  };
}

/** Schedules (or replaces) the entry's reminder; cancels it if remindAt is empty or past. */
export async function syncJournalReminder(
  entry: Pick<ParsedJournalEntry, 'id' | 'note' | 'checklist' | 'remindAt'>,
) {
  const identifier = journalReminderIdentifier(entry.id);
  try {
    await Notifications.cancelScheduledNotificationAsync(identifier);
    if (!entry.remindAt || entry.remindAt.getTime() <= Date.now()) return;
    await Notifications.scheduleNotificationAsync({
      identifier,
      content: reminderContent(entry),
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: entry.remindAt },
    });
  } catch (error) {
    console.warn('Failed to schedule journal reminder:', error);
  }
}

export async function cancelJournalReminder(entryId: number) {
  try {
    await Notifications.cancelScheduledNotificationAsync(journalReminderIdentifier(entryId));
  } catch {
    // Nothing scheduled - fine.
  }
}

/**
 * Makes scheduled notifications match the DB: re-creates reminders lost to a
 * restore/reinstall and drops ones whose entry was deleted. Safe to call often.
 */
export async function reconcileJournalReminders(entries: ParsedJournalEntry[]) {
  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') return;
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    const scheduledIds = new Set(
      scheduled.map((n) => n.identifier).filter((id) => id.startsWith(REMINDER_PREFIX)),
    );
    const wanted = new Map<string, ParsedJournalEntry>();
    const now = Date.now();
    for (const entry of entries) {
      if (entry.remindAt && entry.remindAt.getTime() > now) {
        wanted.set(journalReminderIdentifier(entry.id), entry);
      }
    }
    for (const id of scheduledIds) {
      if (!wanted.has(id)) await Notifications.cancelScheduledNotificationAsync(id);
    }
    for (const [id, entry] of wanted) {
      if (!scheduledIds.has(id)) await syncJournalReminder(entry);
    }
  } catch (error) {
    console.warn('Failed to reconcile journal reminders:', error);
  }
}

export function formatReminder(date: Date): string {
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  const time = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  if (sameDay) return `Today, ${time}`;
  if (date.toDateString() === tomorrow.toDateString()) return `Tomorrow, ${time}`;
  return `${date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    ...(date.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}),
  })}, ${time}`;
}
