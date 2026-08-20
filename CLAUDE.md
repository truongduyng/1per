# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository layout

Two independent projects:

- `app/` - the Expo mobile app (npm)
- `worker/` - Cloudflare Worker backend (D1 + Workers AI) for onboarding analytics and AI-generated affirmations

Naming: the product is **1Per**, but the internal slug/bundle is `kadoze` (`app.kadoze.yikudo`). `README.md` is the PRD describing the current product.

## Commands

App (run from `app/`, uses `npm`):

```bash
npm run start        # Expo dev server
npm run ios          # iOS simulator (targets 'iPhone 17')  |  make dev (from root)
npm run lint
npm run build        # EAS production build, iOS, --local   |  make build
npm run submit       # Submit to App Store                  |  make submit
```

Worker (run from `worker/`, or via root Makefile):

```bash
npm run dev                # wrangler dev            |  make worker-dev
npm run deploy             # wrangler deploy         |  make worker-deploy
npm run db:migrate         # apply D1 migrations remote  |  make worker-migrate
npm run db:migrate:local   # apply D1 migrations local   |  make worker-migrate-local
```

Release: `make bump` (optionally `BUMP=minor|major`) bumps the version, builds, and submits.

There is no test suite configured.

### iOS native module errors ("Cannot find native module 'X'")

If Metro reports a missing native module (e.g. `ExpoAsset`, `ExponentConstants`) after a dependency bump, the compiled native app is out of sync with `package.json`. Fix order:

1. Confirm you're opening the **development build**, not Expo Go - Expo Go bundles a fixed SDK and cannot have project-specific native modules. In the `expo start` terminal, press `s` to ensure "Using development build" is shown, then `i`.
2. `cd app/ios && pod install`, then rebuild (`npm run ios`).
3. If the module is still missing from the compiled binary after that (check with `otool -L`/`nm` on the built `.app`, or an empty `Pods/<ModuleName>` source directory alongside a populated `Target Support Files/<ModuleName>`), CocoaPods' install is corrupted - remove `ios/Pods`, `ios/Podfile.lock`, and the stale `~/Library/Developer/Xcode/DerivedData/1Per-*` folder, then `pod install` and rebuild from scratch.

## Architecture Overview

**1Per** is an offline-first iOS/Android app (React Native + Expo SDK 55, React 19) for getting 1% better every day - one main daily goal, habit tracking, focus sessions, and an evening reset in one unified workspace. User data is local-first, with optional Sign in with Apple cloud backup/restore.

### Directory layout (inside `app/`)

```
app/           Expo Router file-based routes
  _layout.tsx  Root layout: ThemePreferenceProvider → ProfileInitializer → Stack
  (tabs)/      Bottom-tab shell using expo-router unstable-native-tabs (NativeTabs)
    index.tsx     Home / unified dashboard
    routines.tsx  Habit tracker
    profile.tsx   Account & settings
  onboarding.tsx  First-run flow (gates app until complete)
  focus.tsx       Focus session screen
  evening-reset.tsx  Evening reflection flow
  settings.tsx

components/    Presentational components, grouped by feature
contexts/      ThemeContext (system/light/dark preference stored in MMKV)
hooks/         Data + behavior hooks (useProfile, useOnboarding, useRevenueCat, etc.)
lib/
  db/
    schema.ts      Drizzle-ORM table definitions (single source of truth for types)
    database.ts    expo-sqlite connection + drizzle instance
    operations.ts  Typed CRUD helpers: profileOps, habitOps, completionOps,
                   dailyFocusOps, dailyAffirmationOps
    index.ts       Re-exports + initializeDatabase() + resetDatabase()
  storage.ts     MMKV instance (theme prefs and lightweight key-value state)
  backend.ts     HTTP client for the worker (see "Backend worker" below)
  dailyAffirmation.ts  Fetch/cache affirmation + push to widget via ExtensionStorage
  appBlocker.ts  Screen Time app blocking via react-native-device-activity
  eveningReflection.ts, timeCapsule.ts, notifications.ts, timezone.ts, performance.ts
targets/       Native Apple extensions (see "Apple targets" below)
constants/
  theme.ts     palette (charcoal + burnt orange), Colors, Fonts
```

### Data layer

- **SQLite via expo-sqlite + Drizzle ORM** - local-first. Versioned snapshots can be backed up to the Worker after Sign in with Apple.
- Schema tables: `profiles`, `habits`, `habit_completions`, `daily_focus`, `daily_affirmations`.
- `initializeDatabase()` runs `CREATE TABLE IF NOT EXISTS` on cold start via `ProfileInitializer`.
- `resetDatabase()` drops all tables and clears MMKV - used in dev/reset flows.
- Dates stored as `TEXT` (`'YYYY-MM-DD'`) for daily keys; timestamps stored as `INTEGER` (unix epoch).
- All DB operations go through the typed helpers in `lib/db/operations.ts`, never raw SQL in components.

### Backend worker

- `lib/backend.ts` reads `EXPO_PUBLIC_CLOUDFLARE_WORKER_URL` (fallback `EXPO_PUBLIC_BACKEND_URL`); if unset, every call silently no-ops - keep it that way so the app stays fully offline-capable. Requests have an 8s abort timeout.
- Worker endpoints (`worker/src/index.ts`): `GET /health`, `GET /api/affirmation?date=YYYY-MM-DD` (generates via Workers AI `@cf/meta/llama-3.1-8b-instruct-fp8`, cached per-date in D1), `POST /api/onboarding` (stores onboarding submissions), `POST /api/auth/session`, and authenticated `GET/PUT /api/sync` for user snapshots. Apply migrations `0003_user_snapshots.sql` and `0004_sync_sessions.sql` before deploying sync.
- D1 schema changes go in `worker/migrations/` as numbered SQL files, applied with wrangler migrations commands.

### Apple targets (`app/targets/`)

Built with `@kingstinct/expo-apple-targets` (config in each target's `expo-target.config.js`; regenerated into `ios/` by prebuild - don't hand-edit the generated Xcode project). Note: `@bacons/apple-targets` (the actively maintained successor at [evanbacon/expo-apple-targets](https://github.com/evanbacon/expo-apple-targets)) cannot be adopted here without dropping `react-native-device-activity`'s Screen Time targets - both packages register an identically-named internal Xcode-project config-plugin mod (`xcodeProjectBeta2`), so having both active as plugins always collides during prebuild, regardless of directory scoping. `react-native-device-activity` still depends on `@kingstinct/expo-apple-targets` internally, so this app stays on it for all targets.

- `DailyAffirmationWidget` - WidgetKit home-screen widget. The app writes the day's affirmation into the App Group (`group.app.kadoze.yikudo`) via `ExtensionStorage` in `lib/dailyAffirmation.ts`; the Swift widget reads it.
- `ActivityMonitorExtension`, `ShieldAction`, `ShieldConfiguration` - Screen Time / FamilyControls extensions backing the doomscroll app blocker (`lib/appBlocker.ts`, selection id `kadoze-doomscroll-apps`).

### Startup / navigation flow

1. `_layout.tsx` wraps everything in `ThemePreferenceProvider` (MMKV-backed) and `ProfileInitializer`.
2. `ProfileInitializer` calls `initializeDatabase()` then checks for an existing profile.
   - No profile → create one → redirect to `/onboarding`.
   - Profile exists but `onboarding_completed = false` → redirect to `/onboarding`.
   - Otherwise → land on `(tabs)`.
3. Onboarding sets `onboarding_completed = true` on the profile row when finished, and posts the submission to the worker (best-effort).

### Theming

- Default theme is **dark**; user can override to `system` or `light` via `ThemePreferenceProvider`.
- Preference persisted in MMKV under key `theme_preference`.
- Color tokens live in `constants/theme.ts` (`palette`, `Colors`, `Fonts`). Use `palette.*` for direct color values and `Colors.dark.*` / `Colors.light.*` for semantic tokens.
- Tab bar uses native blur (`systemChromeMaterialDark`/`systemChromeMaterial`).

### Key libraries

| Library | Purpose |
|---|---|
| `expo-router` | File-based routing + unstable native tabs |
| `expo-sqlite` + `drizzle-orm` | Local SQLite database |
| `react-native-mmkv` | Fast key-value storage |
| `react-native-reanimated` + `react-native-gesture-handler` | Animations & gestures |
| `@shopify/react-native-skia` | Canvas/graphics |
| `react-native-purchases` | RevenueCat in-app purchases |
| `expo-notifications` | Push & local notifications |
| `react-native-device-activity` | Screen Time / app blocking (iOS) |
| `@kingstinct/expo-apple-targets` | Widget & extension targets + App Group storage |
| `react-native-keyboard-controller` | Keyboard-aware layouts |
