import * as DeviceActivity from "react-native-device-activity";
import { storage, STORAGE_KEYS } from "@/lib/storage";

type AuthorizationStatus = "approved" | "denied" | "notDetermined" | "unsupported" | "unknown";

export const APP_BLOCKER_SELECTION_ID = "kadoze-doomscroll-apps";

const DAILY_LOCK_ACTIVITY_NAME = "kadoze-daily-lock";
const DEFAULT_DAILY_LOCK_HOUR = 0;
const DEFAULT_DAILY_LOCK_MINUTE = 0;

export type DailyLockTime = { hour: number; minute: number };

// "goal": unlock once the main task is done.
// "goal_and_habits": unlock only once the main task AND all of today's habits are done.
export type AppLockCondition = "goal" | "goal_and_habits";
const DEFAULT_LOCK_CONDITION: AppLockCondition = "goal_and_habits";

export type AppBlockerSelectionSummary = {
  supported: boolean;
  applicationCount?: number;
  categoryCount?: number;
  webDomainCount?: number;
  hasSelection?: boolean;
};

function getSummaryFromMetadata(
  metadata?: DeviceActivity.ActivitySelectionMetadata,
): AppBlockerSelectionSummary {
  const applicationCount = metadata?.applicationCount ?? 0;
  const categoryCount = metadata?.categoryCount ?? 0;
  const webDomainCount = metadata?.webDomainCount ?? 0;

  return {
    supported: DeviceActivity.isAvailable(),
    applicationCount,
    categoryCount,
    webDomainCount,
    hasSelection: applicationCount + categoryCount + webDomainCount > 0,
  };
}

function getSelectionInput(): DeviceActivity.ActivitySelectionInput {
  return { activitySelectionId: APP_BLOCKER_SELECTION_ID };
}

const SHIELD_BACKGROUND = { red: 28, green: 30, blue: 31 };
const SHIELD_ORANGE = { red: 251, green: 146, blue: 60 };
const SHIELD_WHITE = { red: 255, green: 255, blue: 255 };
const SHIELD_WHITE_MUTED = { red: 255, green: 255, blue: 255, alpha: 0.55 };
const SHIELD_TEXT_INVERSE = { red: 10, green: 10, blue: 10 };

function updateDefaultShield() {
  DeviceActivity.updateShield(
    {
      // Shield colors are a fixed dark palette, not adaptive to the device's
      // system appearance. Without an explicit non-adaptive blur style, iOS
      // renders backgroundColor through a system-adaptive material, which
      // washes it out to a light background (with barely-visible text) when
      // the device is in light mode. systemMaterialDark keeps the blur dark
      // regardless of system appearance.
      backgroundBlurStyle: DeviceActivity.UIBlurEffectStyle.systemMaterialDark,
      backgroundColor: SHIELD_BACKGROUND,
      title: "Not right now",
      titleColor: SHIELD_WHITE,
      subtitle: "Finish your main task and daily habits first - then this can wait a little longer.",
      subtitleColor: SHIELD_WHITE_MUTED,
      iconSystemName: "target",
      iconTint: SHIELD_ORANGE,
      primaryButtonLabel: "Back to 1Per",
      primaryButtonLabelColor: SHIELD_TEXT_INVERSE,
      primaryButtonBackgroundColor: SHIELD_ORANGE,
    },
    {
      primary: {
        behavior: "close",
      },
    },
    "Kadoze updated anti-doomscroll shield",
  );
}

function readDailyLockTime(): DailyLockTime {
  return {
    hour: storage.getNumber(STORAGE_KEYS.APP_LOCK_HOUR) ?? DEFAULT_DAILY_LOCK_HOUR,
    minute: storage.getNumber(STORAGE_KEYS.APP_LOCK_MINUTE) ?? DEFAULT_DAILY_LOCK_MINUTE,
  };
}

// One second before `hour:minute`, wrapping past midnight - so the daily
// interval covers the full 24h up to the moment it restarts.
function intervalEndBefore({ hour, minute }: DailyLockTime) {
  const totalSeconds = (((hour * 60 + minute) * 60 - 1) + 86400) % 86400;
  return {
    hour: Math.floor(totalSeconds / 3600),
    minute: Math.floor((totalSeconds % 3600) / 60),
    second: totalSeconds % 60,
  };
}

function scheduleDailyLock() {
  const lockTime = readDailyLockTime();

  DeviceActivity.configureActions({
    activityName: DAILY_LOCK_ACTIVITY_NAME,
    callbackName: "intervalDidStart",
    actions: [
      {
        type: "blockSelection",
        familyActivitySelectionId: APP_BLOCKER_SELECTION_ID,
      },
    ],
  });

  return DeviceActivity.startMonitoring(
    DAILY_LOCK_ACTIVITY_NAME,
    {
      intervalStart: { hour: lockTime.hour, minute: lockTime.minute, second: 0 },
      intervalEnd: intervalEndBefore(lockTime),
      repeats: true,
    },
    [],
  );
}

function mapAuthorizationStatus(
  status: DeviceActivity.AuthorizationStatusType,
): AuthorizationStatus {
  if (status === DeviceActivity.AuthorizationStatus.approved) return "approved";
  if (status === DeviceActivity.AuthorizationStatus.denied) return "denied";
  if (status === DeviceActivity.AuthorizationStatus.notDetermined) return "notDetermined";
  return "unknown";
}

export const appBlocker = {
  isSupported: DeviceActivity.isAvailable(),

  async requestAuthorization() {
    if (!DeviceActivity.isAvailable()) return false;
    await DeviceActivity.requestAuthorization("individual");
    return true;
  },

  async getAuthorizationStatus(): Promise<AuthorizationStatus> {
    if (!DeviceActivity.isAvailable()) return "unsupported";
    return mapAuthorizationStatus(DeviceActivity.getAuthorizationStatus());
  },

  async presentActivityPicker(): Promise<AppBlockerSelectionSummary> {
    return this.getSelectionSummary();
  },

  async applyShield(): Promise<AppBlockerSelectionSummary> {
    if (!DeviceActivity.isAvailable()) return { supported: false };
    updateDefaultShield();
    DeviceActivity.blockSelection(getSelectionInput(), "Kadoze anti-doomscroll lock active");
    DeviceActivity.refreshManagedSettingsStore();
    // Registers an OS-level schedule so the shield re-applies itself at the
    // start of every day even if the app is never opened that day.
    await scheduleDailyLock();
    return this.getSelectionSummary();
  },

  async clearShield() {
    if (!DeviceActivity.isAvailable()) return false;
    DeviceActivity.unblockSelection(getSelectionInput(), "Kadoze anti-doomscroll lock unlocked");
    DeviceActivity.refreshManagedSettingsStore();
    // Keep the daily re-lock schedule registered even while unlocked today,
    // so the shield still comes back on its own at the start of tomorrow.
    await scheduleDailyLock();
    return true;
  },

  reset() {
    if (!DeviceActivity.isAvailable()) return;
    DeviceActivity.stopMonitoring([DAILY_LOCK_ACTIVITY_NAME]);
    DeviceActivity.unblockSelection(
      getSelectionInput(),
      "Kadoze anti-doomscroll reset",
    );
    DeviceActivity.clearAllManagedSettingsStoreSettings();
    DeviceActivity.refreshManagedSettingsStore();
  },

  getDailyLockTime(): DailyLockTime {
    return readDailyLockTime();
  },

  async setDailyLockTime(hour: number, minute: number) {
    storage.set(STORAGE_KEYS.APP_LOCK_HOUR, hour);
    storage.set(STORAGE_KEYS.APP_LOCK_MINUTE, minute);
    if (!DeviceActivity.isAvailable()) return false;
    // Re-register immediately so the new time takes effect without waiting
    // for the next applyShield/clearShield call.
    await scheduleDailyLock();
    return true;
  },

  getLockCondition(): AppLockCondition {
    const stored = storage.getString(STORAGE_KEYS.APP_LOCK_CONDITION);
    return stored === "goal" || stored === "goal_and_habits"
      ? stored
      : DEFAULT_LOCK_CONDITION;
  },

  setLockCondition(condition: AppLockCondition) {
    storage.set(STORAGE_KEYS.APP_LOCK_CONDITION, condition);
  },

  async getSelectionSummary(): Promise<AppBlockerSelectionSummary> {
    if (!DeviceActivity.isAvailable()) return { supported: false };

    try {
      const metadata = DeviceActivity.activitySelectionMetadata(getSelectionInput());
      return getSummaryFromMetadata(metadata);
    } catch {
      return getSummaryFromMetadata();
    }
  },
};

export const AppBlockerSelectionSheet = DeviceActivity.DeviceActivitySelectionSheetViewPersisted;
export type AppBlockerSelectionMetadata = DeviceActivity.ActivitySelectionMetadata;
