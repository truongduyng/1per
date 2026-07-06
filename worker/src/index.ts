interface Env {
  DB: D1Database;
  AI: Ai;
}

interface OnboardingSubmission {
  profileId: number | null;
  name: string;
  avatar: string;
  painPoints: string[];
  mainGoal: string;
  keystoneHabit: string;
  referralSource: string;
  completedAt: string;
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(body: unknown, init: ResponseInit = {}) {
  return Response.json(body, {
    ...init,
    headers: {
      ...CORS_HEADERS,
      ...init.headers,
    },
  });
}

function badRequest(message: string) {
  return json({ ok: false, error: message }, { status: 400 });
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isDateKey(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function cleanAffirmation(value: string) {
  return value
    .replace(/^["“”'`]+|["“”'`]+$/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
}

function parseSubmission(value: unknown): OnboardingSubmission | null {
  if (!value || typeof value !== "object") return null;

  const data = value as Partial<OnboardingSubmission>;
  const profileId =
    typeof data.profileId === "number" || data.profileId === null
      ? data.profileId
      : null;

  if (
    !isString(data.name) ||
    !isString(data.avatar) ||
    !Array.isArray(data.painPoints) ||
    !data.painPoints.every(isString) ||
    !isString(data.mainGoal) ||
    !isString(data.keystoneHabit) ||
    !isString(data.referralSource) ||
    !isString(data.completedAt)
  ) {
    return null;
  }

  return {
    profileId,
    name: data.name.slice(0, 120),
    avatar: data.avatar.slice(0, 120),
    painPoints: data.painPoints.slice(0, 3).map((item) => item.slice(0, 240)),
    mainGoal: data.mainGoal.slice(0, 1000),
    keystoneHabit: data.keystoneHabit.slice(0, 120),
    referralSource: data.referralSource.slice(0, 120),
    completedAt: data.completedAt,
  };
}

async function handleOnboarding(request: Request, env: Env) {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return badRequest("Invalid JSON body.");
  }

  const submission = parseSubmission(payload);
  if (!submission) {
    return badRequest("Invalid onboarding payload.");
  }

  await env.DB.prepare(
    `INSERT INTO onboarding_submissions (
      profile_id,
      name,
      avatar,
      pain_points,
      main_goal,
      keystone_habit,
      referral_source,
      completed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      submission.profileId,
      submission.name,
      submission.avatar,
      JSON.stringify(submission.painPoints),
      submission.mainGoal,
      submission.keystoneHabit,
      submission.referralSource,
      submission.completedAt,
    )
    .run();

  return json({ ok: true }, { status: 201 });
}

async function generateAffirmation(env: Env, date: string) {
  const result = await env.AI.run("@cf/meta/llama-3.1-8b-instruct", {
    messages: [
      {
        role: "system",
        content:
          "You write concise daily affirmations for a focus and habit-building app. Return exactly one sentence, no quotes, no emoji, no markdown.",
      },
      {
        role: "user",
        content:
          `Generate a warm, grounded affirmation for ${date}. It should be original, 8 to 18 words, first person, practical, and not cheesy.`,
      },
    ],
    max_tokens: 48,
    temperature: 0.8,
  });

  const response = typeof result.response === "string" ? result.response : "";
  const affirmation = cleanAffirmation(response);

  if (!affirmation) {
    throw new Error("Workers AI returned an empty affirmation.");
  }

  return affirmation;
}

async function handleAffirmation(request: Request, env: Env) {
  const url = new URL(request.url);
  const date = url.searchParams.get("date") ?? "";

  if (!isDateKey(date)) {
    return badRequest("Invalid date. Expected YYYY-MM-DD.");
  }

  const existing = await env.DB.prepare(
    "SELECT text FROM daily_affirmations WHERE date = ? LIMIT 1",
  )
    .bind(date)
    .first<{ text: string }>();

  if (existing?.text) {
    return json({ ok: true, affirmation: existing.text, source: "db" });
  }

  const affirmation = await generateAffirmation(env, date);

  await env.DB.prepare(
    `INSERT INTO daily_affirmations (date, text, source, updated_at)
      VALUES (?, ?, 'workers-ai', CURRENT_TIMESTAMP)
      ON CONFLICT(date) DO UPDATE SET
        text = excluded.text,
        source = excluded.source,
        updated_at = CURRENT_TIMESTAMP`,
  )
    .bind(date, affirmation)
    .run();

  return json({ ok: true, affirmation, source: "workers-ai" }, { status: 201 });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (request.method === "GET" && url.pathname === "/health") {
      return json({ ok: true });
    }

    if (request.method === "GET" && url.pathname === "/api/affirmation") {
      return handleAffirmation(request, env);
    }

    if (request.method === "POST" && url.pathname === "/api/onboarding") {
      return handleOnboarding(request, env);
    }

    return json({ ok: false, error: "Not found." }, { status: 404 });
  },
};
