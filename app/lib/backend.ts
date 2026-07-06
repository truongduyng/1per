const WORKER_URL =
  process.env.EXPO_PUBLIC_CLOUDFLARE_WORKER_URL ??
  process.env.EXPO_PUBLIC_BACKEND_URL;
const REQUEST_TIMEOUT_MS = 8000;

export interface OnboardingSubmission {
  profileId: number | null;
  name: string;
  avatar: string;
  painPoints: string[];
  mainGoal: string;
  keystoneHabit: string;
  referralSource: string;
  completedAt: string;
}

function endpoint(path: string) {
  const baseUrl = WORKER_URL?.trim().replace(/^["']|["']$/g, "");
  if (!baseUrl) return null;
  return `${baseUrl.replace(/\/$/, "")}${path}`;
}

async function postJson(path: string, body: unknown) {
  const url = endpoint(path);
  if (!url) return;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Backend request failed with status ${response.status}`);
    }
  } finally {
    clearTimeout(timeout);
  }
}

export async function submitOnboarding(data: OnboardingSubmission) {
  await postJson("/api/onboarding", data);
}

export interface GeneratedAffirmationResponse {
  affirmation: string;
}

export async function fetchGeneratedAffirmation(date: string): Promise<string> {
  const url = endpoint(`/api/affirmation?date=${encodeURIComponent(date)}`);
  if (!url) {
    throw new Error("Backend URL is not configured.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, { signal: controller.signal });

    if (!response.ok) {
      throw new Error(`Affirmation request failed with status ${response.status}`);
    }

    const data = (await response.json()) as Partial<GeneratedAffirmationResponse>;
    const affirmation = data.affirmation?.trim();
    if (!affirmation) {
      throw new Error("Affirmation response was empty.");
    }

    return affirmation;
  } finally {
    clearTimeout(timeout);
  }
}
