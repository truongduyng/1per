const WORKER_URL =
  process.env.EXPO_PUBLIC_CLOUDFLARE_WORKER_URL ??
  process.env.EXPO_PUBLIC_BACKEND_URL;
const REQUEST_TIMEOUT_MS = 8000;

export type CloudSnapshot = {
  version: number;
  profiles: Record<string, unknown>[];
  challenges: Record<string, unknown>[];
  habits: Record<string, unknown>[];
  habit_completions: Record<string, unknown>[];
  daily_focus: Record<string, unknown>[];
  daily_affirmations: Record<string, unknown>[];
};

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

async function syncRequest(path: string, identityToken: string, init: RequestInit = {}) {
  const url = endpoint(path);
  if (!url) throw new Error("Backend URL is not configured.");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${identityToken}`,
        ...init.headers,
      },
      signal: controller.signal,
    });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`Sync request failed with status ${response.status}`);
    return (await response.json()) as CloudSnapshot;
  } finally {
    clearTimeout(timeout);
  }
}

export function downloadCloudSnapshot(identityToken: string) {
  return syncRequest("/api/sync", identityToken);
}

export async function createSyncSession(identityToken: string) {
  const result = await syncRequest("/api/auth/session", identityToken, { method: "POST" });
  const token = (result as { sessionToken?: string } | null)?.sessionToken;
  if (!token) throw new Error("The sync session could not be created.");
  return token;
}

export function uploadCloudSnapshot(identityToken: string, snapshot: CloudSnapshot) {
  return syncRequest("/api/sync", identityToken, {
    method: "PUT",
    body: JSON.stringify(snapshot),
  });
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
