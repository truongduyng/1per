import type { IoniconName } from "./iconNames";

export interface ChallengeRule {
  title: string;
  subtitle?: string;
  icon: IoniconName;
}

export interface PresetChallenge {
  id: string;
  title: string;
  subtitle: string;
  icon: IoniconName;
  durationDays: number;
  rules: ChallengeRule[];
}

export const PRESET_CHALLENGES: PresetChallenge[] = [
  {
    id: "75-hard",
    title: "69 Hard",
    subtitle: "No compromises. 69 days, five daily non-negotiables.",
    icon: "flame-outline",
    durationDays: 69,
    rules: [
      { title: "Follow your diet", subtitle: "No cheat meals, no alcohol", icon: "nutrition-outline" },
      { title: "Workout #1", subtitle: "45 minutes", icon: "barbell-outline" },
      { title: "Workout #2 (outdoors)", subtitle: "45 minutes", icon: "walk-outline" },
      { title: "Drink a gallon of water", subtitle: "3.7 liters", icon: "water-outline" },
      { title: "Read 10 pages", subtitle: "Non-fiction", icon: "book-outline" },
      { title: "Take a progress photo", icon: "camera-outline" },
    ],
  },
  {
    id: "75-soft",
    title: "69 Soft",
    subtitle: "A sustainable version. 69 days, room to breathe.",
    icon: "leaf-outline",
    durationDays: 69,
    rules: [
      { title: "Eat with intention", subtitle: "One planned treat a week is fine", icon: "nutrition-outline" },
      { title: "Workout", subtitle: "45 minutes, one rest day a week", icon: "barbell-outline" },
      { title: "Drink 3 liters of water", icon: "water-outline" },
      { title: "Read 10 pages", subtitle: "Any book counts", icon: "book-outline" },
    ],
  },
  {
    id: "30-day-reset",
    title: "30-Day Reset",
    subtitle: "A month to rebuild your basics.",
    icon: "refresh-outline",
    durationDays: 30,
    rules: [
      { title: "No added sugar", icon: "nutrition-outline" },
      { title: "Move for 20 minutes", icon: "walk-outline" },
      { title: "Drink 2 liters of water", icon: "water-outline" },
      { title: "Lights out by 11pm", icon: "moon-outline" },
    ],
  },
  {
    id: "21-day-habit-builder",
    title: "21-Day Habit Builder",
    subtitle: "Three weeks to lock in a new routine.",
    icon: "sparkles-outline",
    durationDays: 21,
    rules: [
      { title: "Morning routine", subtitle: "Same steps, every day", icon: "sunny-outline" },
      { title: "Journal 5 minutes", icon: "journal-outline" },
      { title: "No phone first hour", icon: "phone-portrait-outline" },
    ],
  },
  {
    id: "digital-detox-week",
    title: "7-Day Digital Detox",
    subtitle: "One week off the feed.",
    icon: "airplane-outline",
    durationDays: 7,
    rules: [
      { title: "No social media", icon: "phone-portrait-outline" },
      { title: "Phone-free first hour", icon: "sunny-outline" },
      { title: "Read instead of scroll", subtitle: "20 minutes", icon: "book-outline" },
    ],
  },
];
