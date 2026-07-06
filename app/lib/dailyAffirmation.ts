import { ExtensionStorage } from "@kingstinct/expo-apple-targets";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { Platform, Share } from "react-native";

export type DailyAffirmation = {
  text: string;
  date: string;
  dayLabel: string;
  index: number;
};

export const AFFIRMATION_WIDGET_KIND = "DailyAffirmationWidget";
export const AFFIRMATION_APP_GROUP = "group.app.kadoze.yikudo";
export const AFFIRMATION_WIDGET_STORAGE_KEY = "dailyAffirmation";

const DAILY_AFFIRMATIONS = [
  "I can make today lighter by choosing the next honest step.",
  "My attention is valuable, and I spend it with care.",
  "Small progress counts when it is pointed in the right direction.",
  "I do not need a perfect mood to keep a promise to myself.",
  "I can pause, breathe, and begin again without drama.",
  "The version of me I am building is worth protecting.",
  "I am allowed to move slowly and still move forward.",
  "My future self benefits from the simple thing I do now.",
  "I can finish one meaningful thing before I chase more noise.",
  "Discipline can feel calm, kind, and steady.",
  "I choose the work that makes me proud after the day is done.",
  "A focused hour can change the shape of the whole day.",
  "I am not behind; I am here, and here is workable.",
  "My energy returns when I stop arguing with the first step.",
  "I can be patient with myself and still be decisive.",
  "Today does not need to be heroic to be meaningful.",
  "I can make room for clarity by doing less on purpose.",
  "My habits are votes for the life I want to live.",
  "I can trust myself to keep returning.",
  "The next right action is enough.",
];

function hashDateKey(dateKey: string) {
  let hash = 0;
  for (let i = 0; i < dateKey.length; i += 1) {
    hash = (hash * 31 + dateKey.charCodeAt(i)) >>> 0;
  }
  return hash;
}

export function getDailyAffirmation(dateKey: string, dayLabel: string): DailyAffirmation {
  const index = hashDateKey(dateKey) % DAILY_AFFIRMATIONS.length;

  return {
    text: DAILY_AFFIRMATIONS[index],
    date: dateKey,
    dayLabel,
    index,
  };
}

export function syncDailyAffirmationWidget(affirmation: DailyAffirmation) {
  const extensionStorage = new ExtensionStorage(AFFIRMATION_APP_GROUP);
  extensionStorage.set(AFFIRMATION_WIDGET_STORAGE_KEY, affirmation);
  ExtensionStorage.reloadWidget(AFFIRMATION_WIDGET_KIND);
}

export async function copyDailyAffirmation(text: string) {
  await Clipboard.setStringAsync(text);
  if (Platform.OS === "ios") {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }
}

export async function shareDailyAffirmation(text: string) {
  await Share.share({ message: text });
}
