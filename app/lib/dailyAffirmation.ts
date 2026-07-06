import { ExtensionStorage } from "@kingstinct/expo-apple-targets";
import { fetchGeneratedAffirmation } from "@/lib/backend";
import { dailyAffirmationOps } from "@/lib/db";

export type DailyAffirmation = {
  text: string;
  date: string;
  dayLabel: string;
  source: "ai";
};

export const AFFIRMATION_WIDGET_KIND = "DailyAffirmationWidget";
export const AFFIRMATION_APP_GROUP = "group.app.kadoze.yikudo";
export const AFFIRMATION_WIDGET_STORAGE_KEY = "dailyAffirmation";

function toDailyAffirmation(
  dateKey: string,
  dayLabel: string,
  text: string,
  source: DailyAffirmation["source"]
): DailyAffirmation {
  return {
    text,
    date: dateKey,
    dayLabel,
    source,
  };
}

export async function getDailyAffirmation(dateKey: string, dayLabel: string): Promise<DailyAffirmation> {
  const existing = await dailyAffirmationOps.getByDate(dateKey);
  if (existing) {
    return toDailyAffirmation(dateKey, dayLabel, existing.text, "ai");
  }

  const text = await fetchGeneratedAffirmation(dateKey);
  await dailyAffirmationOps.upsert({ date: dateKey, text, source: "ai" });
  return toDailyAffirmation(dateKey, dayLabel, text, "ai");
}

export function syncDailyAffirmationWidget(affirmation: DailyAffirmation) {
  const extensionStorage = new ExtensionStorage(AFFIRMATION_APP_GROUP);
  extensionStorage.set(AFFIRMATION_WIDGET_STORAGE_KEY, affirmation);
  ExtensionStorage.reloadWidget(AFFIRMATION_WIDGET_KIND);
}
