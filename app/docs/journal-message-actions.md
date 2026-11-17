# Journal message actions

The composer accepts one message (typed or dictated) with optional photos/videos.
There are no separate habit, checklist, or reminder creation forms. The attachment
sheet combines the camera and a recent-media grid; File is no longer offered.

Sending saves the original message immediately and releases the composer.
`analyzeMessage` runs asynchronously, then updates the saved entry with an existing
completed habit, checklist items, a reminder time and tags. SQLite live queries
refresh the bubble automatically. Relative dates use the time Send was pressed.
A matched habit is checked in; an inferred reminder requests notification permission
and schedules the existing entry notification. Failure leaves the message saved.

Edits save immediately and start new analysis when text changes or previous analysis
was pending. Matching checklist items retain their ids and completion state.
Edits, deletions and direct corrections invalidate pending results. The DB update
also checks the original row fields atomically, so stale analysis cannot overwrite
newer data. Jobs run in the app process; terminating the app can interrupt inference.

On a compatible device with Apple Intelligence available, the native
`interpretAsync` method uses Foundation Models guided generation. The reference
date and timezone are supplied explicitly. Checklist text stays in the user's
language. Rebuild the native app after changing this module; a Metro refresh alone
cannot install a new native method.

When the model is unavailable, fails, or exceeds twelve seconds, conservative local
rules handle explicit English/Vietnamese requests and markdown lists. This fallback
is not a language model and does not promise general natural-language understanding.
Older installed native builds retain their original habit/tag model and use rules
for lists and reminders until rebuilt. Message text is not sent to a server.

Examples:

- `Vừa đọc xong 10 trang` can check in an existing reading habit.
- `Cần mua sữa, trứng và cà phê` becomes three checklist items.
- `Mai 8 giờ nhắc mình gọi mẹ` schedules tomorrow at 08:00 local time.
- `Mai sẽ đọc sách` does not check in a habit or create a reminder.
- `Nhắc mình gọi mẹ` saves the note and asks for a clear future time in the message.

The existing Auto-organize messages preference controls inference. Users can
correct inferred fields by editing their message, toggle checklist items directly,
cancel an existing reminder, or unlink an incorrectly matched habit.

Validation: `node --test tests/journalIntents.test.mjs` (Node 24+) and
`npx tsc --noEmit`. Tests cover structured-model output, EN/VI offline cases,
invalid/past dates, permission denial, disabled inference, save integration, and
preserving checked items during edits, immediate sending with a slow model, stale
results after edits/deletions/corrections, and inference failure. Live Foundation Models availability and
quality depend on the installed OS, model assets and Apple Intelligence settings;
the JavaScript tests use a stubbed native bridge, not a live language model.
