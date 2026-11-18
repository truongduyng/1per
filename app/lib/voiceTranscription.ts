import { useCallback, useEffect, useRef, useState } from "react";
import { Platform, Settings } from "react-native";
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from "expo-speech-recognition";
import { getDictationLanguage } from "./journalSettings";

// Journal-by-talking transcription. Prefers on-device recognition
// (requiresOnDeviceRecognition) so voice never leaves the phone, matching the
// app's offline-first data model, but falls back to network-based
// recognition when the device has no on-device speech model installed (or
// none for the chosen language) - otherwise `start()` fails and the mic
// looks broken.

export type VoiceTranscriptionStatus = "idle" | "listening" | "error";

/** What went wrong, plus a hint for how the composer should help the user recover. */
export interface VoiceTranscriptionError {
  code: string;
  title: string;
  message: string;
  /** iOS dictation/permission is off: offer a shortcut to Settings. */
  needsSettings: boolean;
  /** Worth offering the keyboard's own dictation mic as a fallback. */
  suggestKeyboard: boolean;
}

interface UseVoiceTranscription {
  status: VoiceTranscriptionStatus;
  start: (baseText: string) => Promise<void>;
  stop: () => void;
}

const DICTATION_OFF_MESSAGE =
  "Dictation is turned off on this iPhone. Turn it on in Settings → General → Keyboard → Enable Dictation, " +
  "and make sure Siri & Dictation isn't blocked in Screen Time → Content & Privacy Restrictions.\n\n" +
  "Meanwhile, you can tap the mic on your keyboard to dictate.";

export function describeError(code: string): VoiceTranscriptionError {
  switch (code) {
    case "no-speech":
      return {
        code,
        title: "Didn't catch that",
        message: "No speech was detected. Try again.",
        needsSettings: false,
        suggestKeyboard: false,
      };
    case "service-not-allowed":
      return {
        code,
        title: "Dictation is off",
        message: DICTATION_OFF_MESSAGE,
        needsSettings: true,
        suggestKeyboard: true,
      };
    case "not-allowed":
      return {
        code,
        title: "Microphone access needed",
        message:
          "Allow Microphone and Speech Recognition for 1Per in Settings to dictate.\n\n" +
          "Meanwhile, you can tap the mic on your keyboard to dictate.",
        needsSettings: true,
        suggestKeyboard: true,
      };
    case "audio-capture":
      return {
        code,
        title: "Couldn't transcribe",
        message: "Couldn't access the microphone. Another app may be using it.",
        needsSettings: false,
        suggestKeyboard: true,
      };
    case "network":
      return {
        code,
        title: "Couldn't transcribe",
        message:
          "Speech recognition for this language needs a network connection. " +
          "You can still use the mic on your keyboard.",
        needsSettings: false,
        suggestKeyboard: true,
      };
    case "language-not-supported":
      return {
        code,
        title: "Language not supported",
        message:
          "Dictation isn't available for this language here. Pick another one in Settings → Journal, " +
          "or use the mic on your keyboard.",
        needsSettings: false,
        suggestKeyboard: true,
      };
    default:
      return {
        code,
        title: "Couldn't transcribe",
        message: "Speech recognition failed. Try again, or use the mic on your keyboard.",
        needsSettings: false,
        suggestKeyboard: true,
      };
  }
}

const LANGUAGE_DEFAULT_REGION: Record<string, string> = {
  en: "en-US",
  vi: "vi-VN",
};

/** BCP-47 tag of the user's first preferred language, e.g. "vi-VN". */
function devicePreferredLocale(): string {
  let tag: string | undefined;
  if (Platform.OS === "ios") {
    const languages = Settings.get("AppleLanguages");
    if (Array.isArray(languages) && typeof languages[0] === "string") {
      tag = languages[0];
    }
  }
  if (!tag) {
    try {
      tag = Intl.DateTimeFormat().resolvedOptions().locale;
    } catch {
      // Intl unavailable - fall through to English.
    }
  }
  tag = (tag ?? "en-US").replace("_", "-");
  // Recognizers want language-REGION; "vi" alone or script-tagged tags won't resolve.
  const parts = tag.split("-");
  const language = parts[0].toLowerCase();
  const region = parts.find((p, i) => i > 0 && /^[A-Z]{2}$/.test(p));
  return region ? `${language}-${region}` : LANGUAGE_DEFAULT_REGION[language] ?? tag;
}

export function resolveDictationLocale(): string {
  const chosen = getDictationLanguage();
  return chosen === "auto" ? devicePreferredLocale() : chosen;
}

// Errors where retrying without the on-device requirement can help. iOS
// reports "on-device speech assets not installed" (kLSRErrorDomain 102) as
// service-not-allowed, the same code as "Siri & Dictation disabled" (201).
const ON_DEVICE_RETRYABLE = new Set(["language-not-supported", "service-not-allowed", "unknown"]);

/** onTranscript fires with the full text (baseText + everything spoken so far) as recognition updates. */
export function useVoiceTranscription(
  onTranscript: (text: string) => void,
  onError?: (error: VoiceTranscriptionError) => void,
): UseVoiceTranscription {
  const [status, setStatus] = useState<VoiceTranscriptionStatus>("idle");
  const baseTextRef = useRef("");
  const sessionRef = useRef<{ lang: string; onDevice: boolean; gotResult: boolean } | null>(null);
  const retryingRef = useRef(false);
  const onTranscriptRef = useRef(onTranscript);
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onTranscriptRef.current = onTranscript;
    onErrorRef.current = onError;
  });

  const startRecognizer = useCallback((lang: string, onDevice: boolean) => {
    sessionRef.current = { lang, onDevice, gotResult: false };
    setStatus("listening");
    ExpoSpeechRecognitionModule.start({
      lang,
      interimResults: true,
      continuous: true,
      requiresOnDeviceRecognition: onDevice,
      addsPunctuation: true,
    });
  }, []);

  useSpeechRecognitionEvent("result", (event) => {
    if (sessionRef.current) sessionRef.current.gotResult = true;
    const spoken = event.results[0]?.transcript ?? "";
    const base = baseTextRef.current;
    onTranscriptRef.current(base && spoken ? `${base} ${spoken}` : base || spoken);
  });

  useSpeechRecognitionEvent("end", () => {
    // The failed on-device session ends after its error; the retry is already live.
    if (retryingRef.current) return;
    setStatus((prev) => (prev === "error" ? prev : "idle"));
  });

  useSpeechRecognitionEvent("error", (event) => {
    console.warn("Speech recognition error:", event.error, event.message);
    const session = sessionRef.current;
    if (session?.onDevice && !session.gotResult && ON_DEVICE_RETRYABLE.has(event.error)) {
      // Retry once with server-based recognition, e.g. when the device has no
      // on-device model for this language.
      retryingRef.current = true;
      setTimeout(() => {
        if (!retryingRef.current || sessionRef.current !== session) {
          // Stopped by the user while the retry was pending.
          setStatus((prev) => (prev === "listening" ? "idle" : prev));
          return;
        }
        retryingRef.current = false;
        startRecognizer(session.lang, false);
      }, 150);
      return;
    }
    setStatus("error");
    onErrorRef.current?.(describeError(event.error));
  });

  useEffect(() => {
    return () => {
      ExpoSpeechRecognitionModule.stop();
    };
  }, []);

  const start = useCallback(async (baseText: string) => {
    const supportsOnDevice =
      Platform.OS !== "ios" ||
      ExpoSpeechRecognitionModule.supportsOnDeviceRecognition();

    if (supportsOnDevice) {
      const permission =
        await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!permission.granted) {
        setStatus("error");
        throw new Error("Speech recognition permission denied");
      }
    } else {
      const micPermission =
        await ExpoSpeechRecognitionModule.requestMicrophonePermissionsAsync();
      const speechPermission =
        await ExpoSpeechRecognitionModule.requestSpeechRecognizerPermissionsAsync();
      if (!micPermission.granted || !speechPermission.granted) {
        setStatus("error");
        throw new Error("Speech recognition permission denied");
      }
    }

    baseTextRef.current = baseText.trim();
    retryingRef.current = false;
    startRecognizer(resolveDictationLocale(), supportsOnDevice);
  }, [startRecognizer]);

  const stop = useCallback(() => {
    retryingRef.current = false;
    sessionRef.current = null;
    ExpoSpeechRecognitionModule.stop();
  }, []);

  return { status, start, stop };
}
