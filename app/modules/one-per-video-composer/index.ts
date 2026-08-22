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

export const OnePerVideoComposer = requireNativeModule<OnePerVideoComposerModule>(
  "OnePerVideoComposer"
);
