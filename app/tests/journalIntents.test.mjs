import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import {
  checklistFromText, cleanChecklist, foldText, parseReminderLocal, reminderFromText, requestsReminder,
} from '../lib/journalIntents.ts';

const now = new Date(2026, 10, 17, 14, 0, 0);
const local = (day, hour, minute = 0) => new Date(2026, 10, day, hour, minute);

test('Vietnamese shopping message becomes tasks without translating them', () => {
  assert.deepEqual(checklistFromText('Cần mua sữa, trứng và cà phê'), [
    { text: 'sữa', done: false }, { text: 'trứng', done: false }, { text: 'cà phê', done: false },
  ]);
});
test('English shopping lists and markdown retain completion state', () => {
  assert.deepEqual(checklistFromText('Shopping list: milk, eggs and coffee').map((x) => x.text), ['milk', 'eggs', 'coffee']);
  assert.deepEqual(checklistFromText('Weekend\n- [x] Clear desk\n- [ ] Plan meals'), [
    { text: 'Clear desk', done: true }, { text: 'Plan meals', done: false },
  ]);
});
test('ordinary reflections, completed shopping and cancelled requests are not tasks', () => {
  for (const text of ['I like coffee, books and music.', 'Đã mua sữa, trứng và cà phê.', 'Không cần mua sữa, trứng và cà phê.']) {
    assert.deepEqual(checklistFromText(text), []);
  }
});
test('checklist validation rejects malformed output, duplicates and unbounded model output', () => {
  assert.deepEqual(cleanChecklist([null, { text: '' }, { text: ' Eggs ' }, { text: 'eggs', done: true }, { text: 3 }]), [{ text: 'Eggs', done: false }]);
  assert.equal(cleanChecklist(Array.from({ length: 50 }, (_, i) => ({ text: `Task ${i}` }))).length, 30);
});
test('Vietnamese tomorrow morning resolves in local timezone', () => {
  assert.equal(reminderFromText('Mai 8 giờ nhắc mình gọi mẹ', now)?.getTime(), local(18, 8).getTime());
  assert.equal(reminderFromText('Nhắc mình gọi mẹ lúc 8h30 sáng mai', now)?.getTime(), local(18, 8, 30).getTime());
});
test('English AM/PM and relative durations work', () => {
  assert.equal(reminderFromText('Remind me tomorrow at 8 PM to call Mum', now)?.getTime(), local(18, 20).getTime());
  assert.equal(reminderFromText('Remind me tomorrow at 8pm to call Mum', now)?.getTime(), local(18, 20).getTime());
  assert.equal(reminderFromText('Nhắc mình uống nước sau 30 phút', now)?.getTime(), now.getTime() + 30 * 60000);
  assert.equal(reminderFromText('Remind me in 2 hours to stretch', now)?.getTime(), now.getTime() + 2 * 3600000);
});
test('does not turn future plans or cancellations into reminders', () => {
  for (const text of ['Mai 8 giờ sẽ gọi mẹ', 'Tomorrow at 8 AM I will call Mum', 'Không cần nhắc mình mai 8 giờ', "Don't remind me tomorrow at 8 PM"]) {
    assert.equal(requestsReminder(text), false);
    assert.equal(reminderFromText(text, now), null);
  }
});
test('missing time, invalid date, past time and impossible clock are not guessed', () => {
  for (const text of ['Remind me tomorrow to call Mum', 'Nhắc mình gọi mẹ', 'Remind me at 8 AM', 'Nhắc mình lúc 25 giờ', 'Remind me on 2027-02-30 at 8 AM']) {
    assert.equal(reminderFromText(text, now), null, text);
  }
  assert.equal(parseReminderLocal('2027-02-30T08:00', now), null);
  assert.equal(parseReminderLocal('2026-11-17T08:00', now), null);
  assert.equal(parseReminderLocal('2026-11-18T25:00', now), null);
  assert.equal(parseReminderLocal('2026-11-18T08:00', now)?.getTime(), local(18, 8).getTime());
});

const require = createRequire(import.meta.url);
const ts = require('typescript');

function loadAnalysis(native) {
  const source = readFileSync(new URL('../lib/journalIntelligence.ts', import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  const deps = {
    'one-per-intelligence': { OnePerIntelligence: native },
    './journal': { extractHashtags: () => [], normalizeTag: (tag) => tag.toLowerCase().trim() },
    './journalIntents': { checklistFromText, cleanChecklist, foldText: (s) => s.normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/g, 'd').toLowerCase(), parseReminderLocal, reminderFromText, requestsReminder },
  };
  new Function('require', 'module', 'exports', compiled)((name) => deps[name], module, module.exports);
  return module.exports;
}

const habits = [{ id: 4, title: 'Read 10 pages' }];
test('AI receives date and timezone; structured output becomes real actions', async () => {
  let args;
  const api = loadAnalysis({ isAvailable: () => true, interpretAsync: async (...input) => {
    args = input;
    return { habitId: 4, tags: ['reading'], checklist: [{ text: 'Gọi mẹ', done: false }], reminderRequested: true, reminderLocal: '2026-11-18T08:00' };
  } });
  const result = await api.analyzeMessage({ text: 'Đã đọc 10 trang. Mai 8 giờ nhắc gọi mẹ.', habits, knownTags: [], now });
  assert.equal(result.source, 'apple');
  assert.equal(result.habitId, 4);
  assert.equal(result.checklist[0].text, 'Gọi mẹ');
  assert.equal(result.remindAt.getTime(), local(18, 8).getTime());
  assert.equal(args[3], now.toISOString());
  assert.equal(typeof args[4], 'string');
});
test('unlisted AI habit ids and invalid AI dates never become actions', async () => {
  const api = loadAnalysis({ isAvailable: () => true, interpretAsync: async () => ({
    habitId: 99, tags: [], checklist: [], reminderRequested: true, reminderLocal: '2026-11-18T25:00',
  }) });
  const result = await api.analyzeMessage({ text: 'Hello', habits, knownTags: [], now });
  assert.equal(result.habitId, null);
  assert.equal(result.remindAt, null);
});
test('unavailable model and older installed native builds still handle explicit actions', async () => {
  for (const native of [null, { isAvailable: () => false }, { isAvailable: () => true, analyzeAsync: async () => ({ habitId: -1, tags: [] }) }]) {
    const api = loadAnalysis(native);
    const result = await api.analyzeMessage({ text: 'Cần mua sữa, trứng và cà phê', habits, knownTags: [], now });
    assert.equal(result.checklist.length, 3);
  }
});
test('offline matcher distinguishes completed habits from plans and negations', async () => {
  const api = loadAnalysis(null);
  for (const text of ['Mai sẽ đọc sách', 'Chưa đọc 10 trang', 'Hôm qua đã đọc 10 trang', 'I will read 10 pages', "I didn't read today", 'I read 10 pages yesterday']) {
    assert.equal((await api.analyzeMessage({ text, habits, knownTags: [] })).habitId, null, text);
  }
  assert.equal((await api.analyzeMessage({ text: 'Vừa đọc xong 10 trang', habits, knownTags: [] })).habitId, 4);
});

function loadSaving({ allowed = true, enabled = true, analysis, analyze } = {}) {
  const events = [];
  let sequence = 0;
  const rows = new Map();
  const parse = (row) => ({ tags: [], attachments: [], checklist: [], photoUri: null, habitId: null, remindAt: null, ...row });
  const deps = {
    'expo-document-picker': {}, 'expo-image-picker': {},
    'react-native': { Alert: { alert: (...args) => events.push(['alert', ...args]) } },
    './cloudSync': { deleteBackedUpJournalMedia() {}, deleteBackedUpJournalPhoto() {} },
    './db': {
      habitOps: { getAll: async () => habits },
      journalEntryOps: {
        getAll: async () => [...rows.values()],
        getById: async (id) => rows.get(id) ?? null,
        create: async (draft, autoTags = []) => {
          events.push(['create', draft]);
          const row = parse({ id: ++sequence, date: '2026-11-17', ...draft, autoTags });
          rows.set(row.id, row);
          return [row];
        },
        update: async (id, draft, autoTags) => {
          events.push(['update', draft]);
          const row = parse({ ...rows.get(id), id, date: '2026-11-17', ...draft, ...(autoTags ? { autoTags } : {}) });
          rows.set(id, row);
          return [row];
        },
        setAnalysis: async (id, expected, data) => {
          if (JSON.stringify(rows.get(id)) !== JSON.stringify(expected)) return [];
          events.push(['analysis', data]);
          const row = { ...rows.get(id), ...data };
          rows.set(id, row);
          return [row];
        },
        delete: async (id) => { rows.delete(id); events.push(['delete', id]); },
        setChecklist: async (id, checklist) => { rows.set(id, { ...rows.get(id), checklist }); },
        setHabit: async (id, habitId) => { rows.set(id, { ...rows.get(id), habitId }); },
      },
      completionOps: { markDoneKeepingCheckIn: async (id) => events.push(['done', id]) },
    },
    './journalIntelligence': { analyzeMessage: analyze ?? (async () => analysis ?? { habitId: 4, tags: ['reading'], checklist: [], remindAt: null, reminderRequested: false }) },
    './journalSettings': { isAutoOrganizeEnabled: () => enabled },
    './journalIntents': { foldText },
    './journal': {
      cancelJournalReminder: async () => events.push(['cancel']),
      draftFromEntry: (entry) => entry,
      ensureReminderPermission: async () => allowed,
      mergeTags: (...tags) => [...new Set(tags.flat())],
      newLocalId: () => `item-${++sequence}`,
      parseJournalEntry: parse,
      syncJournalReminder: async (entry) => events.push(['schedule', entry.remindAt]),
    },
    './journalPhotos': { deleteJournalMedia() {}, deleteJournalPhoto() {} },
  };
  const source = readFileSync(new URL('../lib/journalActions.ts', import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', compiled)((name) => deps[name], module, module.exports);
  return { ...module.exports, events, rows };
}
const draft = (note) => ({ note, habitId: null, tags: [], links: [], attachments: [], photoUri: null, checklist: [], remindAt: null });

const drain = async () => { for (let i = 0; i < 8; i++) await new Promise(setImmediate); };

test('saving returns immediately, then applies all three actions in the background', async () => {
  const remindAt = new Date(Date.now() + 3600000);
  const api = loadSaving({ analysis: { habitId: 4, tags: ['reading'], checklist: [{ text: 'Gọi mẹ', done: false }], remindAt, reminderRequested: true } });
  const saved = await api.createJournalMessage(draft('Đọc xong rồi, nhớ nhắc mình gọi mẹ.'));
  assert.equal(saved.habitId, null);
  await drain();
  const entry = api.rows.get(saved.id);
  assert.equal(entry.note, 'Đọc xong rồi, nhớ nhắc mình gọi mẹ.');
  assert.equal(entry.habitId, 4);
  assert.equal(entry.checklist[0].text, 'Gọi mẹ');
  assert.equal(entry.remindAt, remindAt);
  assert.equal(entry.autoTags[0], 'reading');
  assert.ok(api.events.some(([type, id]) => type === 'done' && id === 4));
  assert.ok(api.events.some(([type]) => type === 'schedule'));
});
test('notification denial saves the message and checklist, without a fake reminder', async () => {
  const api = loadSaving({ allowed: false, analysis: { habitId: null, tags: [], checklist: [{ text: 'Mua sữa', done: false }], remindAt: new Date(Date.now() + 3600000), reminderRequested: true } });
  const saved = await api.createJournalMessage(draft('Cần mua sữa, mai 8 giờ nhắc mình.'));
  await drain();
  const entry = api.rows.get(saved.id);
  assert.equal(entry.remindAt, null);
  assert.equal(entry.checklist.length, 1);
  assert.ok(api.events.some(([type]) => type === 'alert'));
  assert.ok(!api.events.some(([type]) => type === 'schedule'));
});
test('editing inferred lists preserves existing checked items and ids', async () => {
  const api = loadSaving({ analysis: { habitId: null, tags: [], checklist: [{ text: 'Sữa', done: false }, { text: 'Trứng', done: false }], remindAt: null, reminderRequested: false } });
  const previous = { ...draft('Cần mua sữa'), id: 5, date: '2026-11-17', autoTags: [], checklist: [{ id: 'old', text: 'Sữa', done: true }] };
  const saved = await api.updateJournalMessage(previous, { ...draft('Cần mua sữa và trứng'), checklist: previous.checklist });
  await drain();
  const entry = api.rows.get(saved.id);
  assert.deepEqual(entry.checklist[0], { id: 'old', text: 'Sữa', done: true });
  assert.equal(entry.checklist[1].done, false);
});
test('auto-organize disabled keeps a plain message without silently applying actions', async () => {
  const api = loadSaving({ enabled: false });
  const entry = await api.createJournalMessage(draft('Read 10 pages'));
  await drain();
  assert.equal(entry.habitId, null);
  assert.ok(!api.events.some(([type]) => type === 'done'));
});


function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}
const actions = { habitId: 4, tags: ['reading'], checklist: [{ text: 'Task', done: false }], remindAt: new Date(Date.now() + 3600000), reminderRequested: true };

test('a slow model never blocks sending or clearing the composer', async () => {
  const model = deferred();
  const api = loadSaving({ analyze: () => model.promise });
  const entry = await api.createJournalMessage(draft('Read 10 pages'));
  assert.equal(entry.note, 'Read 10 pages');
  assert.equal(api.events[0][0], 'create');
  assert.ok(!api.events.some(([type]) => type === 'analysis'));
  model.resolve(actions);
  await drain();
  assert.equal(api.rows.get(entry.id).habitId, 4);
});

test('deleting while AI runs prevents actions, schedules and stale updates', async () => {
  const model = deferred();
  const api = loadSaving({ analyze: () => model.promise });
  const entry = await api.createJournalMessage(draft('Read 10 pages'));
  await drain();
  await api.deleteJournalMessage(entry);
  model.resolve(actions);
  await drain();
  assert.equal(api.rows.has(entry.id), false);
  assert.ok(!api.events.some(([type]) => ['analysis', 'done', 'schedule', 'alert'].includes(type)));
});

test('editing starts new analysis and ignores the older result arriving last', async () => {
  const first = deferred();
  const second = deferred();
  let calls = 0;
  const api = loadSaving({ analyze: () => (++calls === 1 ? first.promise : second.promise) });
  const entry = await api.createJournalMessage(draft('Old message'));
  await drain();
  await api.updateJournalMessage(entry, draft('New message'));
  await drain();
  second.resolve({ ...actions, habitId: null, tags: ['new'], remindAt: null, reminderRequested: false });
  await drain();
  first.resolve(actions);
  await drain();
  assert.equal(api.rows.get(entry.id).note, 'New message');
  assert.deepEqual(api.rows.get(entry.id).autoTags, ['new']);
  assert.equal(api.rows.get(entry.id).habitId, null);
  assert.ok(!api.events.some(([type]) => ['done', 'schedule', 'alert'].includes(type)));
});

test('checking an item while AI runs keeps the user change', async () => {
  const model = deferred();
  const api = loadSaving({ analyze: () => model.promise });
  const entry = await api.createJournalMessage({ ...draft('Tasks'), checklist: [{ id: 'task', text: 'Task', done: false }] });
  await drain();
  await api.toggleChecklistItem(entry, 'task');
  model.resolve(actions);
  await drain();
  assert.equal(api.rows.get(entry.id).checklist[0].done, true);
  assert.ok(!api.events.some(([type]) => type === 'analysis'));
});

test('an inference failure keeps the saved message intact', async () => {
  const api = loadSaving({ analyze: async () => { throw new Error('Model unavailable'); } });
  const entry = await api.createJournalMessage(draft('Keep this note'));
  await drain();
  assert.equal(api.rows.get(entry.id).note, 'Keep this note');
  assert.ok(!api.events.some(([type]) => type === 'analysis'));
});

test('a row changed while notification permission is pending rejects stale analysis', async () => {
  const permission = deferred();
  const api = loadSaving({ allowed: permission.promise, analysis: actions });
  const entry = await api.createJournalMessage(draft('Remind me'));
  await drain();
  // Simulate a concurrent DB update outside the action helpers.
  api.rows.set(entry.id, { ...api.rows.get(entry.id), note: 'Changed elsewhere' });
  permission.resolve(true);
  await drain();
  assert.equal(api.rows.get(entry.id).note, 'Changed elsewhere');
  assert.ok(!api.events.some(([type]) => ['analysis', 'done', 'schedule', 'alert'].includes(type)));
});
