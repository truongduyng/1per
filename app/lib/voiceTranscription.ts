import { useCallback, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from "expo-speech-recognition";

// Journal-by-talking transcription. Prefers on-device recognition
// (requiresOnDeviceRecognition) so voice never leaves the phone, matching the
// app's offline-first data model, but falls back to network-based
// recognition when the device has no on-device speech model installed -
// otherwise `start()` fails silently and the mic looks broken.

export type VoiceTranscriptionStatus = "idle" | "listening" | "error";

interface UseVoiceTranscription {
  status: VoiceTranscriptionStatus;
  start: (baseText: string) => Promise<void>;
  stop: () => void;
}

const ERROR_MESSAGES: Partial<Record<string, string>> = {
  "no-speech": "Didn't catch any speech. Try again.",
  "audio-capture": "Couldn't access the microphone.",
  "not-allowed": "Microphone or speech recognition access was denied.",
  network: "Speech recognition needs a network connection.",
  "language-not-supported": "This language isn't supported for dictation.",
  "service-not-allowed": "Speech recognition service isn't available.",
};

function messageForError(code: string): string {
  return ERROR_MESSAGES[code] ?? "Speech recognition failed. Please try again.";
}

/** onTranscript fires with the full text (baseText + everything spoken so far) as recognition updates. */
export function useVoiceTranscription(
  onTranscript: (text: string) => void,
  onError?: (message: string) => void,
): UseVoiceTranscription {
  const [status, setStatus] = useState<VoiceTranscriptionStatus>("idle");
  const baseTextRef = useRef("");
  const onTranscriptRef = useRef(onTranscript);
  onTranscriptRef.current = onTranscript;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  useSpeechRecognitionEvent("result", (event) => {
    const spoken = event.results[0]?.transcript ?? "";
    const base = baseTextRef.current;
    onTranscriptRef.current(base && spoken ? `${base} ${spoken}` : base || spoken);
  });

  useSpeechRecognitionEvent("end", () => {
    setStatus((prev) => (prev === "error" ? prev : "idle"));
  });

  useSpeechRecognitionEvent("error", (event) => {
    console.warn("Speech recognition error:", event.error, event.message);
    setStatus("error");
    onErrorRef.current?.(messageForError(event.error));
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
    setStatus("listening");
    ExpoSpeechRecognitionModule.start({
      lang: "en-US",
      interimResults: true,
      continuous: true,
      requiresOnDeviceRecognition: supportsOnDevice,
      addsPunctuation: true,
    });
  }, []);

  const stop = useCallback(() => {
    ExpoSpeechRecognitionModule.stop();
  }, []);

  return { status, start, stop };
}
