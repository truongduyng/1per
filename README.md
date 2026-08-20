# Product Requirements Document (PRD)

**Product Name:** 1Per

## 1. Product Vision & Objective

To help people get 1% better every day through one clear daily goal, a small set of keystone habits, and protected focus time. The application empowers users to achieve lasting change through small, consistent, daily actions rather than overwhelming overhauls - while actively defending their attention from doomscrolling.

## 2. Problem Statement

Users don't fail at self-improvement because they lack goals; they fail because their days are fragmented and their attention is hijacked. Endless to-do lists, competing priorities, and infinite-scroll apps mean the one thing that matters never gets done, and habits quietly die after a missed day.

## 3. Target Audience

Professionals, solopreneurs, and continuous learners who want a distraction-free environment to commit to one daily priority, build keystone habits, and reclaim focus from their phone.

## 4. Design & Technical Constraints

* **UI/UX:** Minimalist, distraction-free interface utilizing a charcoal and burnt orange palette to reduce eye strain while providing clear visual hierarchy. Dark theme by default.
* **Framework:** Cross-platform mobile development (React Native / Expo); iOS is the primary shipping platform.
* **Data:** Offline-first SQLite with optional Sign in with Apple cloud backup and restore. The app remains usable without a network connection.
* **Backend:** A lightweight Cloudflare Worker (D1 + Workers AI) used only for AI-generated daily affirmations and anonymous onboarding analytics. The app must remain fully functional with no network.
* **Monetization:** RevenueCat subscription (annual) and lifetime purchase, presented as the final onboarding step.

---

## 5. Functional Requirements (Core Features)

### 5.1. Unified Daily Dashboard

* **One Main Goal:** The day centers on a single self-chosen target. Setting it is the first prompt of the day.
* **Today's Habits:** Habits scheduled for the current weekday, completable inline.
* **Daily Affirmation:** An AI-generated affirmation greets the user each morning (cached per date, offline-safe fallback).

### 5.2. Focus Sessions

* **Single-Tasking Timer:** A 25-minute focus room showing only the main goal and a countdown ring; the screen stays awake and navigation falls away.
* **Session Logging:** Elapsed focus time is recorded against the day's focus entry.

### 5.3. Habit Tracker (Routines)

* **Weekday Scheduling:** Each habit has a name, optional description, icon, and the days of the week it's due.
* **Consistency Tracking:** Completions are tracked per day, visualized in a heatmap; streaks and bounce-back rate matter more than intensity.

### 5.4. Evening Reset

* **Guided Wind-Down:** A timed three-step ritual - clean your space, clean your mind, plan for tomorrow.
* **Auto-Reflection:** The app builds a summary and a pattern insight from the day's goal and habit completions.

### 5.5. Doomscroll App Blocker (iOS)

* **Screen Time Integration:** Users select the apps that steal their attention; FamilyControls shield extensions block them, turning intention into enforcement.

### 5.6. Daily Affirmation Widget (iOS)

* **Home-Screen Widget:** A WidgetKit widget displays the day's affirmation, shared from the app via an App Group.

### 5.7. Time Capsule

* **Letter to Future Self:** The user writes a letter sealed for 30/90+ days alongside a snapshot of their current streak, completions, bounce-back rate, and mood - revealed when the date arrives.

### 5.8. Conversion-Focused Onboarding

* A questionnaire funnel (pain → amplification → identity → main goal → keystone habit → screen-time setup → notifications → referral source → paywall) that personalizes the app and gates entry until complete.

---

## 6. User Flows

### Flow 1: First-Time Onboarding & Intention Setting

1. **Trigger:** User opens the app for the first time.
2. **Action:** User moves through the questionnaire: pains, identity, main life goal, and *one* keystone habit.
3. **Action:** User optionally selects doomscroll apps to block and enables notifications.
4. **Action:** User reaches the paywall and starts a plan (or lifetime purchase).
5. **Resolution:** User lands on the Unified Dashboard, prompted to set today's "One Main Goal."

### Flow 2: The Single-Tasking Deep Work Session

1. **Trigger:** User sets their "One Main Goal" on the dashboard.
2. **Action:** User taps "Start Focus."
3. **System Response:** The UI strips away to the goal text, a countdown ring, and a 25-minute timer; the screen stays awake.
4. **Action:** Timer reaches zero (or user ends early).
5. **Resolution:** Focus time is logged to the day's entry.

### Flow 3: The Evening Reset

1. **Trigger:** User opens the Evening Reset in the evening.
2. **Action:** User steps through the timed ritual: clean your space, clean your mind, plan for tomorrow.
3. **System Response:** The app presents an auto-built reflection - what happened today and the pattern it reveals.
4. **Resolution:** User sets tomorrow's intention, completing the daily loop.

### Flow 4: Blocking Doomscroll Apps

1. **Trigger:** During onboarding (or later from settings), the user opts to protect their focus.
2. **Action:** The native Screen Time selection sheet appears; user picks apps/categories.
3. **System Response:** Shield extensions block the selected apps.
4. **Resolution:** Attempted opens of blocked apps are intercepted, redirecting attention back to the day's goal.
