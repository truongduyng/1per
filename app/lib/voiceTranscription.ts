import { useCallback, useEffect, useRef, useState } from "react";
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from "expo-speech-recognition";

// Journal-by-talking transcription. Runs fully on-device (requiresOnDeviceRecognition)
// so voice never leaves the phone, matching the app's offline-first data model.

export type VoiceTranscriptionStatus = "idle" | "listening" | "error";

interface UseVoiceTranscription {
  status: VoiceTranscriptionStatus;
  start: (baseText: string) => Promise<void>;
  stop: () => void;
}

/** onTranscript fires with the full text (baseText + everything spoken so far) as recognition updates. */
export function useVoiceTranscription(
  onTranscript: (text: string) => void,
): UseVoiceTranscription {
  const [status, setStatus] = useState<VoiceTranscriptionStatus>("idle");
  const baseTextRef = useRef("");
  const onTranscriptRef = useRef(onTranscript);
  onTranscriptRef.current = onTranscript;

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
  });

  useEffect(() => {
    return () => {
      ExpoSpeechRecognitionModule.stop();
    };
  }, []);

  const start = useCallback(async (baseText: string) => {
    const permission =
      await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!permission.granted) {
      setStatus("error");
      throw new Error("Speech recognition permission denied");
    }

    baseTextRef.current = baseText.trim();
    setStatus("listening");
    ExpoSpeechRecognitionModule.start({
      lang: "en-US",
      interimResults: true,
      continuous: true,
      requiresOnDeviceRecognition: true,
      addsPunctuation: true,
    });
  }, []);

  const stop = useCallback(() => {
    ExpoSpeechRecognitionModule.stop();
  }, []);

  return { status, start, stop };
}
