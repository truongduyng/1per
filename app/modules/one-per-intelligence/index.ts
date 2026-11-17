import { requireOptionalNativeModule } from "expo-modules-core";

export type IntelligenceHabit = { id: number; title: string; subtitle?: string | null };
export type IntelligenceResult = { habitId: number; tags: string[] };
export type MessageIntentResult = IntelligenceResult & {
  checklist: { text: string; done: boolean }[];
  reminderLocal: string;
  reminderRequested: boolean;
};

type OnePerIntelligenceModule = {
  isAvailable(): boolean;
  analyzeAsync(text: string, habits: IntelligenceHabit[], knownTags: string[]): Promise<IntelligenceResult>;
  // Optional while an older native build is still installed.
  interpretAsync?(text: string, habits: IntelligenceHabit[], knownTags: string[], referenceDate: string, timeZone: string): Promise<MessageIntentResult>;
};

// Missing in Expo Go / older dev builds - callers fall back to the keyword matcher.
export const OnePerIntelligence =
  requireOptionalNativeModule<OnePerIntelligenceModule>("OnePerIntelligence");
