/** Pure validation and offline handling for actions expressed in a journal message. */
export type InferredChecklistItem = { text: string; done: boolean };

export function foldText(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
}

export function cleanChecklist(value: unknown): InferredChecklistItem[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object' || typeof item.text !== 'string') return [];
    const text = item.text.trim().slice(0, 500);
    const key = foldText(text);
    if (!text || seen.has(key)) return [];
    seen.add(key);
    return [{ text, done: item.done === true }];
  }).slice(0, 30);
}

/** Local wall-clock time, never Date.parse's implementation-dependent interpretation. */
export function parseReminderLocal(value: unknown, now: Date): Date | null {
  if (typeof value !== 'string') return null;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!match) return null;
  const [year, month, day, hour, minute] = match.slice(1).map(Number);
  const date = new Date(year, month - 1, day, hour, minute);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day ||
      date.getHours() !== hour || date.getMinutes() !== minute || date.getTime() <= now.getTime()) return null;
  return date;
}

/** Deliberately narrow fallback: explicit lists, not arbitrary sentences containing commas. */
export function checklistFromText(text: string): InferredChecklistItem[] {
  const bullets = text.split('\n').flatMap((line) => {
    const match = line.match(/^\s*(?:[-*•]|\d+[.)])\s+(?:\[([ xX])\]\s*)?(.+)$/);
    return match ? [{ text: match[2], done: match[1]?.toLowerCase() === 'x' }] : [];
  });
  if (bullets.length) return cleanChecklist(bullets);
  const folded = foldText(text);
  if (/\b(?:khong can|khong phai|dung|don't|do not)\b/.test(folded)) return [];
  const cue = folded.match(/\b(?:checklist|to-do list|todo list|shopping list|can mua|can lam|viec can lam|danh sach(?: mua sam)?|need to buy|need to do|buy)\s*:?\s*/);
  if (!cue || cue.index === undefined) return [];
  // Accent folding doesn't change these character offsets (combining marks are normalized first).
  const normalized = text.normalize('NFC');
  const tail = normalized.slice(cue.index + cue[0].length).trim().split(/[.!?]\s+/u)[0].replace(/[.!]+$/, '');
  const parts = tail.split(/\s*(?:,|;|\n|\s+and\s+|\s+và\s+)\s*/iu).filter(Boolean);
  return parts.length >= 2 ? cleanChecklist(parts.map((part) => ({ text: part, done: false }))) : [];
}

export function requestsReminder(text: string): boolean {
  const s = foldText(text);
  return /\b(?:remind(?: me)?|reminder|nhac(?: minh| toi| to| t)?|dung quen|don't forget)\b/.test(s) &&
    !/\b(?:do not remind|don't remind|cancel (?:the )?reminder|khong (?:can )?nhac|huy (?:loi )?nhac|dung nhac)\b/.test(s);
}

/** Offline reminders require an explicit clock time or duration; no guessed default hour. */
export function reminderFromText(text: string, now: Date): Date | null {
  if (!requestsReminder(text)) return null;
  const s = foldText(text);
  if (/\b(?:yesterday|hom qua|last week|tuan truoc)\b/.test(s)) return null;
  const relative = s.match(/\b(?:in|sau|nua)\s+(\d+)\s*(minutes?|mins?|phut|hours?|hrs?|gio)\b/) ??
    s.match(/\b(\d+)\s*(minutes?|mins?|phut|hours?|hrs?|gio)\s+nua\b/);
  if (relative) {
    const amount = Number(relative[1]);
    if (!amount || amount > 10000) return null;
    return new Date(now.getTime() + amount * (/^(?:h|gio)/.test(relative[2]) ? 3600000 : 60000));
  }
  const clock = s.match(/\b(\d{1,2})(?::|h)(\d{2})?\s*(am|pm)?\b/) ??
    s.match(/\b(\d{1,2})\s*(?:gio|(am|pm))\b/) ??
    s.match(/\b(?:at|luc)\s+(\d{1,2})\b/);
  if (!clock) return null;
  let hour = Number(clock[1]);
  const minute = clock[2] && /^\d+$/.test(clock[2]) ? Number(clock[2]) : 0;
  const period = clock[3] ?? (clock[2] === 'am' || clock[2] === 'pm' ? clock[2] : undefined);
  if (hour > 23 || minute > 59 || (period && (hour < 1 || hour > 12))) return null;
  if (period === 'pm' && hour < 12) hour += 12;
  if (period === 'am' && hour === 12) hour = 0;
  if (!period && /\b(?:toi|chieu|tonight|evening|afternoon)\b/.test(s) && hour < 12) hour += 12;
  const date = new Date(now);
  if (/\b(?:ngay kia|day after tomorrow)\b/.test(s)) date.setDate(date.getDate() + 2);
  else if (/\b(?:mai|tomorrow)\b/.test(s)) date.setDate(date.getDate() + 1);
  const explicitDate = s.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (explicitDate) {
    date.setFullYear(Number(explicitDate[1]), Number(explicitDate[2]) - 1, Number(explicitDate[3]));
    if (date.getFullYear() !== Number(explicitDate[1]) || date.getMonth() !== Number(explicitDate[2]) - 1 || date.getDate() !== Number(explicitDate[3])) return null;
  }
  const weekday = s.match(/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|thu [2-7]|chu nhat)\b/);
  if (weekday) {
    const days: Record<string, number> = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6, 'chu nhat': 0, 'thu 2': 1, 'thu 3': 2, 'thu 4': 3, 'thu 5': 4, 'thu 6': 5, 'thu 7': 6 };
    const ahead = (days[weekday[1]] - now.getDay() + 7) % 7 || 7;
    date.setDate(now.getDate() + ahead);
  }
  date.setHours(hour, minute, 0, 0);
  // A past time today is ambiguous; don't silently schedule it for tomorrow.
  return date.getTime() > now.getTime() ? date : null;
}
