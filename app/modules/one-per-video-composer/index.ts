import { requireNativeModule } from "expo-modules-core";

export type ComposeVideoOptions = {
  videoUris: string[];
  speed?: number;
  goal?: string;
  logoUri?: string;
  durationSeconds: number;
};

type OnePerVideoComposerModule = {
  composeAsync(options: ComposeVideoOptions): Promise<string>;
};

// Expo Go and previously built development clients do not contain this local
// native module. Keep route evaluation safe so Expo Router can still load the
// focus screen; video composition is skipped until a native build is installed.
export const OnePerVideoComposer = (() => {
  try {
    return requireNativeModule<OnePerVideoComposerModule>("OnePerVideoComposer");
  } catch {
    return null;
  }
})();
