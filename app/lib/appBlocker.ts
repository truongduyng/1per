import * as DeviceActivity from "react-native-device-activity";

type AuthorizationStatus = "approved" | "denied" | "notDetermined" | "unsupported" | "unknown";

export const APP_BLOCKER_SELECTION_ID = "kadoze-doomscroll-apps";

const DAILY_LOCK_ACTIVITY_NAME = "kadoze-daily-lock";

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
      backgroundColor: SHIELD_BACKGROUND,
      title: "Not right now",
      titleColor: SHIELD_WHITE,
      subtitle: "Finish your main task and daily habits first — then this can wait a little longer.",
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

function scheduleDailyLock() {
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
      intervalStart: { hour: 0, minute: 0, second: 0 },
      intervalEnd: { hour: 23, minute: 59, second: 59 },
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
