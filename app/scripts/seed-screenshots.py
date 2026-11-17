#!/usr/bin/env python3
"""Seed a simulator SQLite database with fictional, repeatable screenshot data.

Stop the app before running. The existing database is backed up beside the input.
Usage: python3 scripts/seed-screenshots.py /path/to/kado.db
"""
import datetime as dt
import json
import random
import sqlite3
import sys
from pathlib import Path


def seed(path):
    db = sqlite3.connect(path)
    backup = Path(str(path) + '.before-screenshots-' + dt.datetime.now().strftime('%Y%m%d-%H%M%S'))
    with sqlite3.connect(backup) as dest:
        db.backup(dest)
    today = dt.date.today()
    rng = random.Random(41)

    def day(offset):
        return today - dt.timedelta(days=offset)

    def stamp(offset, hour=9, minute=0):
        return int(dt.datetime.combine(day(offset), dt.time(hour, minute)).timestamp())

    def insert(table, **values):
        columns = ','.join(values)
        placeholders = ','.join('?' for _ in values)
        return db.execute(f'INSERT INTO {table} ({columns}) VALUES ({placeholders})', list(values.values())).lastrowid

    with db:
        for table in ('journal_entries', 'habit_completions', 'habits', 'challenges', 'daily_focus', 'daily_affirmations', 'profiles'):
            db.execute(f'DELETE FROM {table}')
        insert('profiles', name='Maya', timezone='Asia/Ho_Chi_Minh', onboarding_completed=1, created_at=stamp(153))
        specs = [
            ('Morning sunlight', '10 minutes outside', 'sunny-outline', 148, .90),
            ('Read 10 pages', 'A little wiser every day', 'book-outline', 131, .84),
            ('Move my body', 'A walk, a stretch, a fresh start', 'walk-outline', 112, .81),
            ('Evening journal', 'Make room for reflection', 'journal-outline', 95, .87),
        ]
        habit_ids = []
        for index, (title, subtitle, icon, age, rate) in enumerate(specs):
            hid = insert('habits', title=title, subtitle=subtitle, icon=icon,
                         days_of_week=json.dumps(['sun','mon','tue','wed','thu','fri','sat']),
                         sort_order=index, created_at=stamp(age))
            habit_ids.append(hid)
            for offset in range(age, -1, -1):
                if offset == 0 and index > 1:
                    continue
                done = offset < 8 or rng.random() < rate
                insert('habit_completions', habit_id=hid, date=str(day(offset)),
                       status='done' if done else 'skipped', created_at=stamp(offset, [7,8,17,21][index], 15))
        goals = [
            'Finish the first draft of my portfolio',
            'Send the proposal to Olivia',
            'Make time for a long walk with Mum',
            'Outline the next chapter of my course',
            'Finish one lesson without checking my phone',
            'Plan meals for the week ahead',
            'Turn my research notes into a clear story',
            'Prepare three ideas for the design review',
            'Clear my desk and plan a calmer week',
        ]
        for offset in range(91, -1, -1):
            complete = offset > 0 and (offset < 8 or rng.random() < .85)
            insert('daily_focus', date=str(day(offset)),
                   goal='Finish the first draft of my portfolio' if offset == 0 else goals[offset % len(goals)],
                   focus_minutes=50 if offset == 0 else rng.choice([25,25,40,50,50,75,90]),
                   completed_at=stamp(offset,16,20) if complete else None,
                   evening_reset_completed_at=stamp(offset,21,10) if offset > 0 and rng.random() < .79 else None,
                   created_at=stamp(offset,8), updated_at=stamp(offset,9))
        insert('daily_affirmations', date=str(today), text='Small steps count. Keep showing up for yourself.', source='fallback', created_at=stamp(0,7), updated_at=stamp(0,7))
        notes = [
            ('A slower morning. Coffee by the window, ten pages, and no phone until breakfast. I want more days that begin like this. #gratitude', ['gratitude']),
            ('Nearly skipped my walk, then went for just ten minutes. Came home with a clearer head. Starting small still counts. #smallwins', ['smallwins']),
            ('The portfolio is finally starting to sound like me. Tomorrow: less polishing, more finishing. #work', ['work']),
            ('Dinner with Mum reminded me that a good day is more than a productive one. #gratitude', ['gratitude']),
            ('Moved my phone to the other room. Two focused blocks felt easier than one distracted hour. #focus', ['focus']),
            ('Missed yesterday. Back today. I am learning to keep one imperfect day from becoming a lost week. #reflection', ['reflection']),
        ]
        for offset in range(28, 0, -1):
            if offset % 3 == 0:
                continue
            note, tags = notes[offset % len(notes)]
            insert('journal_entries', date=str(day(offset)), note=note, tags=json.dumps(tags), created_at=stamp(offset,20,35))
        insert('journal_entries', date=str(today), note='Sunday reset: a little space for the week ahead. #reflection',
               tags='["reflection"]', checklist=json.dumps([
                   {'id':'reset1','text':'Clear my desk','done':True},
                   {'id':'reset2','text':'Plan three priorities','done':True},
                   {'id':'reset3','text':'Make time for a walk','done':False},
               ]), created_at=stamp(0,7,45))
        insert('journal_entries', date=str(today), note='Ten pages before the world got loud. Keeping this little promise to myself. #smallwins',
               tags='["smallwins"]', habit_id=habit_ids[1], created_at=stamp(0,8,20))
        insert('journal_entries', date=str(today), note='Two focus blocks, phone in the other room. The first draft is taking shape. Feeling proud of the progress. #focus',
               tags='["focus"]', created_at=stamp(0,9,30))
    print(f'Seeded {path}\nBackup: {backup}')
    print(dict(db.execute("SELECT 'habits',count(*) FROM habits UNION ALL SELECT 'completions',count(*) FROM habit_completions UNION ALL SELECT 'focus days',count(*) FROM daily_focus UNION ALL SELECT 'journal entries',count(*) FROM journal_entries")))
    assert db.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
    assert not db.execute('PRAGMA foreign_key_check').fetchall()
    db.close()


if __name__ == '__main__':
    seed(Path(sys.argv[1]))
