import { useCallback, useEffect, useRef, useState } from "react";
import { Animated, Easing } from "react-native";
import { router } from "expo-router";
import { profileOps, dailyFocusOps, challengeOps } from "@/lib/db";
import { submitOnboarding } from "@/lib/backend";
import { storage } from "@/lib/storage";
import { GAME_AVATARS, type GameAvatarId } from "@/lib/avatarCatalog";
import type { IoniconName } from "@/lib/iconNames";
import { PRESET_CHALLENGES } from "@/lib/presetChallenges";

// ---------------------------------------------------------------------------
// Step definitions
// ---------------------------------------------------------------------------

export type StepType =
  | "hook"
  | "focus-area"
  | "pain"
  | "pain-amplify"
  | "trust"
  | "future"
  | "identity"
  | "wins"
  | "challenge"
  | "app-tour"
  | "notification"
  | "screentime"
  | "referral"
  | "backup"
  | "paywall";

export interface StepConfig {
  type: StepType;
}

export const STEPS: StepConfig[] = [
  { type: "hook" },
  { type: "focus-area" },
  { type: "pain" },
  { type: "pain-amplify" },
  { type: "trust" },
  { type: "future" },
  { type: "identity" },
  { type: "wins" },
  { type: "challenge" },
  { type: "app-tour" },
  { type: "notification" },
  { type: "screentime" },
  { type: "referral" },
  { type: "backup" },
  { type: "paywall" },
];

export const TOTAL = STEPS.length;

const ONBOARDING_DRAFT_KEY = "onboarding:draft";

interface OnboardingDraft {
  version: 2;
  currentStep: number;
  coreProblem: string | null;
  focusAreas: string[];
  painPoints: string[];
  mainGoal: string;
  selectedChallengeId: string;
  referralSource: string;
  name: string;
  avatar: GameAvatarId;
}

const DEFAULT_ONBOARDING_DRAFT: OnboardingDraft = {
  version: 2,
  currentStep: 0,
  coreProblem: null,
  focusAreas: [],
  painPoints: [],
  mainGoal: "",
  selectedChallengeId: "",
  referralSource: "",
  name: "",
  avatar: GAME_AVATARS[0].id,
};

function readOnboardingDraft(): OnboardingDraft {
  const raw = storage.getString(ONBOARDING_DRAFT_KEY);
  if (!raw) return DEFAULT_ONBOARDING_DRAFT;

  try {
    const draft = JSON.parse(raw) as Partial<OnboardingDraft>;
    return {
      ...DEFAULT_ONBOARDING_DRAFT,
      ...draft,
      currentStep: Math.min(
        Math.max(Math.trunc(draft.currentStep ?? 0), 0),
        TOTAL - 1,
      ),
      coreProblem: draft.coreProblem ?? null,
      focusAreas: Array.isArray(draft.focusAreas) ? draft.focusAreas.slice(0, 1) : [],
      painPoints: Array.isArray(draft.painPoints) ? draft.painPoints.slice(0, 1) : [],
      mainGoal: draft.mainGoal ?? "",
      selectedChallengeId: draft.selectedChallengeId ?? "",
      referralSource: draft.referralSource ?? "",
      name: draft.name ?? "",
      avatar: GAME_AVATARS.some((item) => item.id === draft.avatar)
        ? (draft.avatar as GameAvatarId)
        : DEFAULT_ONBOARDING_DRAFT.avatar,
    };
  } catch {
    return DEFAULT_ONBOARDING_DRAFT;
  }
}

// ---------------------------------------------------------------------------
// Keystone habits
// ---------------------------------------------------------------------------

export interface KeystoneHabit {
  id: string;
  icon: IoniconName;
  title: string;
  subtitle: string;
}

export const KEYSTONE_HABITS_BY_FOCUS: Record<string, KeystoneHabit[]> = {
  health: [
    {
      id: "walk",
      icon: "walk-outline",
      title: "10-minute walk",
      subtitle: "Outside, no headphones - just move and reset",
    },
    {
      id: "water",
      icon: "water-outline",
      title: "Drink 2L of water",
      subtitle: "Most fatigue is just dehydration",
    },
    {
      id: "sleep",
      icon: "bed-outline",
      title: "Lights out by 11pm",
      subtitle: "Sleep is the highest-leverage habit you have",
    },
    {
      id: "stretch",
      icon: "body-outline",
      title: "5-min morning stretch",
      subtitle: "Tells your body the day has started",
    },
  ],
  mindset: [
    {
      id: "journal",
      icon: "journal-outline",
      title: "Brain dump journal",
      subtitle: "5 min - write until your head is clear",
    },
    {
      id: "quiet",
      icon: "body-outline",
      title: "5 minutes of stillness",
      subtitle: "No input, no phone - just breathe",
    },
    {
      id: "gratitude",
      icon: "heart-outline",
      title: "3 things I'm grateful for",
      subtitle: "Rewires your brain toward what's working",
    },
    {
      id: "read",
      icon: "book-outline",
      title: "Read 10 pages",
      subtitle: "Give your attention somewhere worth going",
    },
  ],
  work: [
    {
      id: "mit",
      icon: "radio-button-on-outline",
      title: "Name your one thing",
      subtitle: "Pick the task that makes today count",
    },
    {
      id: "nophone",
      icon: "phone-portrait-outline",
      title: "No phone first hour",
      subtitle: "Own your morning before the world does",
    },
    {
      id: "plan",
      icon: "clipboard-outline",
      title: "Plan tomorrow tonight",
      subtitle: "Write it down so tomorrow-you doesn't have to decide",
    },
    {
      id: "pomodoro",
      icon: "timer-outline",
      title: "One focused sprint",
      subtitle: "25 min deep work - phone flipped, timer set",
    },
  ],
  relations: [
    {
      id: "connect",
      icon: "chatbubble-ellipses-outline",
      title: "Reach out to someone",
      subtitle: "One genuine message a day",
    },
    {
      id: "listen",
      icon: "ear-outline",
      title: "Practice listening",
      subtitle: "Be fully present in conversations",
    },
    {
      id: "gratitude",
      icon: "heart-outline",
      title: "Express gratitude",
      subtitle: "Tell someone you appreciate them",
    },
    {
      id: "offline",
      icon: "phone-portrait-outline",
      title: "Phone-free meals",
      subtitle: "Be present with people around you",
    },
  ],
  creative: [
    {
      id: "create",
      icon: "pencil-outline",
      title: "Create something",
      subtitle: "Even 10 min of making",
    },
    {
      id: "capture",
      icon: "camera-outline",
      title: "Capture one idea",
      subtitle: "Write, draw, or record it",
    },
    {
      id: "explore",
      icon: "earth-outline",
      title: "Learn something new",
      subtitle: "Fuel curiosity daily",
    },
    {
      id: "noscreen",
      icon: "leaf-outline",
      title: "Nature break",
      subtitle: "Step outside for fresh air",
    },
  ],
  finance: [
    {
      id: "review",
      icon: "stats-chart-outline",
      title: "Review your spending",
      subtitle: "Know where your money goes",
    },
    {
      id: "save",
      icon: "cash-outline",
      title: "Save before spending",
      subtitle: "Pay yourself first",
    },
    {
      id: "learn",
      icon: "book-outline",
      title: "Read about money",
      subtitle: "10 min of financial learning",
    },
    {
      id: "track",
      icon: "radio-button-on-outline",
      title: "Track one financial goal",
      subtitle: "Progress compounds daily",
    },
  ],
};

// Fallback for unknown focus
export const DEFAULT_KEYSTONE_HABITS: KeystoneHabit[] = [
  {
    id: "move",
    icon: "walk-outline",
    title: "Move my body",
    subtitle: "A small signal of energy",
  },
  {
    id: "read",
    icon: "book-outline",
    title: "Read daily",
    subtitle: "Give your attention a place to land",
  },
  {
    id: "meditate",
    icon: "body-outline",
    title: "Meditate",
    subtitle: "Practice coming back gently",
  },
  {
    id: "water",
    icon: "water-outline",
    title: "Drink water",
    subtitle: "Start with the body",
  },
  {
    id: "sleep",
    icon: "moon-outline",
    title: "Sleep earlier",
    subtitle: "Protect tomorrow's focus",
  },
  {
    id: "journal",
    icon: "journal-outline",
    title: "Journal",
    subtitle: "Clear one loop from your mind",
  },
];

export const LEGACY_DEFAULT_KEYSTONE_HABITS: KeystoneHabit[] = [
  {
    id: "walk",
    icon: "walk-outline",
    title: "10-minute walk",
    subtitle: "Move your body every day",
  },
  {
    id: "quiet",
    icon: "body-outline",
    title: "5 minutes of quiet",
    subtitle: "Meditate or reflect",
  },
  {
    id: "gratitude",
    icon: "heart-outline",
    title: "Gratitude practice",
    subtitle: "3 things you're grateful for",
  },
  {
    id: "journal",
    icon: "journal-outline",
    title: "5-min journaling",
    subtitle: "Reflect on your thoughts",
  },
];

// Keep for backward compat with completeOnboarding
export const KEYSTONE_HABITS: KeystoneHabit[] = [
  ...DEFAULT_KEYSTONE_HABITS,
  ...LEGACY_DEFAULT_KEYSTONE_HABITS,
  ...Object.values(KEYSTONE_HABITS_BY_FOCUS).flat(),
];

export const ONBOARDING_ANALYTICS_KEY = "onboarding:analytics-events";

export function trackOnboardingEvent(
  name: string,
  properties: Record<string, unknown> = {},
) {
  try {
    const raw = storage.getString(ONBOARDING_ANALYTICS_KEY);
    const events = raw ? (JSON.parse(raw) as unknown[]) : [];
    events.push({
      name,
      properties,
      createdAt: new Date().toISOString(),
    });
    storage.set(ONBOARDING_ANALYTICS_KEY, JSON.stringify(events.slice(-100)));
  } catch {
    storage.set(
      ONBOARDING_ANALYTICS_KEY,
      JSON.stringify([{ name, properties, createdAt: new Date().toISOString() }]),
    );
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useOnboarding() {
  const initialDraft = useRef(readOnboardingDraft()).current;
  const [currentStep, setCurrentStep] = useState(initialDraft.currentStep);
  const fadeAnim = useRef(new Animated.Value(1)).current;

  const [coreProblem, setCoreProblem] = useState<string | null>(
    initialDraft.coreProblem,
  );
  const [focusAreas, setFocusAreas] = useState<string[]>(initialDraft.focusAreas);
  const [painPoints, setPainPoints] = useState<string[]>(initialDraft.painPoints);
  const [mainGoal, setMainGoal] = useState(initialDraft.mainGoal);
  const [selectedChallengeId, setSelectedChallengeId] = useState(
    initialDraft.selectedChallengeId,
  );
  const [referralSource, setReferralSource] = useState(initialDraft.referralSource);
  const [name, setName] = useState(initialDraft.name);
  const [avatar, setAvatar] = useState<GameAvatarId>(initialDraft.avatar);

  useEffect(() => {
    const draft: OnboardingDraft = {
      version: 2,
      currentStep,
      coreProblem,
      focusAreas,
      painPoints,
      mainGoal,
      selectedChallengeId,
      referralSource,
      name,
      avatar,
    };
    storage.set(ONBOARDING_DRAFT_KEY, JSON.stringify(draft));
  }, [avatar, coreProblem, currentStep, focusAreas, mainGoal, name, painPoints, referralSource, selectedChallengeId]);

  useEffect(() => {
    trackOnboardingEvent("onboarding_started");
  }, []);

  useEffect(() => {
    trackOnboardingEvent("onboarding_step_viewed", {
      index: currentStep,
      step: STEPS[currentStep]?.type,
    });
  }, [currentStep]);

  const goToStep = useCallback(
    (next: number) => {
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 220,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }).start(() => {
        setCurrentStep(next);
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 500,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }).start();
      });
    },
    [fadeAnim],
  );

  const goNext = useCallback(() => {
    const next = currentStep + 1;
    if (next >= TOTAL) return;
    goToStep(next);
  }, [currentStep, goToStep]);

  const goBack = useCallback(() => {
    if (currentStep > 0) goToStep(currentStep - 1);
  }, [currentStep, goToStep]);

  const completeOnboarding = useCallback(async () => {
    try {
      const profile = await profileOps.getFirst();
      if (profile) {
        await profileOps.update(profile.id, {
          name: name.trim() || "User",
          avatar,
          onboardingCompleted: true,
        });
      }

      if (mainGoal.trim().length > 0) {
        await dailyFocusOps.upsertGoal(mainGoal);
      }

      const selectedChallenge = PRESET_CHALLENGES.find(
        (preset) => preset.id === selectedChallengeId,
      );
      if (selectedChallenge) {
        await challengeOps.start(selectedChallenge);
        trackOnboardingEvent("onboarding_challenge_started", {
          challenge: selectedChallenge.id,
        });
      }

      try {
        await submitOnboarding({
          profileId: profile?.id ?? null,
          name: name.trim() || "User",
          avatar,
          painPoints,
          mainGoal,
          keystoneHabit: "",
          referralSource,
          completedAt: new Date().toISOString(),
        });
        trackOnboardingEvent("onboarding_backend_synced");
      } catch (syncError) {
        console.error("Error syncing onboarding to backend:", syncError);
        trackOnboardingEvent("onboarding_backend_sync_failed");
      }
    } catch (e) {
      console.error("Error completing onboarding:", e);
    }
    storage.remove(ONBOARDING_DRAFT_KEY);
    trackOnboardingEvent("onboarding_completed");
    router.replace("/(tabs)");
  }, [avatar, mainGoal, name, painPoints, referralSource, selectedChallengeId]);

  const showBack = currentStep > 0;

  return {
    currentStep,
    fadeAnim,
    coreProblem,
    setCoreProblem,
    focusAreas,
    setFocusAreas,
    painPoints,
    setPainPoints,
    mainGoal,
    setMainGoal,
    selectedChallengeId,
    setSelectedChallengeId,
    referralSource,
    setReferralSource,
    name,
    setName,
    avatar,
    setAvatar,
    goNext,
    goBack,
    goToStep,
    showBack,
    completeOnboarding,
  };
}
