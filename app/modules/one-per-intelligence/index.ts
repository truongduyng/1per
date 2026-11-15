import { requireOptionalNativeModule } from "expo-modules-core";

export type IntelligenceHabit = { id: number; title: string; subtitle?: string | null };
export type IntelligenceResult = { habitId: number; tags: string[] };

type OnePerIntelligenceModule = {
  isAvailable(): boolean;
  analyzeAsync(text: string, habits: IntelligenceHabit[], knownTags: string[]): Promise<IntelligenceResult>;
};

// Missing in Expo Go / older dev builds - callers fall back to the keyword matcher.
export const OnePerIntelligence =
  requireOptionalNativeModule<OnePerIntelligenceModule>("OnePerIntelligence");
