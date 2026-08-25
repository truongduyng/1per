interface Env {
  DB: D1Database;
  AI: Ai;
  MEDIA: R2Bucket;
  APPLE_BUNDLE_ID: string;
}

type AppleKey = { kty: string; kid: string; use: string; alg: string; n: string; e: string };

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
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
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

function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(normalized);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function authenticateAppleToken(token: string, env: Env): Promise<string | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  try {
    const header = JSON.parse(new TextDecoder().decode(decodeBase64Url(parts[0]))) as { kid?: string; alg?: string };
    const payload = JSON.parse(new TextDecoder().decode(decodeBase64Url(parts[1]))) as {
      iss?: string; aud?: string; sub?: string; exp?: number;
    };
    if (header.alg !== "RS256" || !header.kid || payload.iss !== "https://appleid.apple.com" ||
      payload.aud !== env.APPLE_BUNDLE_ID || !payload.sub || !payload.exp || payload.exp <= Math.floor(Date.now() / 1000)) {
      return null;
    }

    const keysResponse = await fetch("https://appleid.apple.com/auth/keys");
    if (!keysResponse.ok) return null;
    const keys = (await keysResponse.json()) as { keys: AppleKey[] };
    const key = keys.keys.find((candidate) => candidate.kid === header.kid && candidate.alg === "RS256");
    if (!key) return null;
    const cryptoKey = await crypto.subtle.importKey(
      "jwk", key as JsonWebKey,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"],
    );
    const valid = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5", cryptoKey, decodeBase64Url(parts[2]),
      new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
    );
    return valid ? payload.sub : null;
  } catch {
    return null;
  }
}

async function authenticate(request: Request, env: Env): Promise<string | null> {
  const authorization = request.headers.get("Authorization");
  const token = authorization?.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!token) return null;

  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  const tokenHash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  const session = await env.DB.prepare(
    "SELECT user_id FROM sync_sessions WHERE token_hash = ? AND expires_at > ? LIMIT 1",
  ).bind(tokenHash, Math.floor(Date.now() / 1000)).first<{ user_id: string }>();
  return session?.user_id ?? authenticateAppleToken(token, env);
}

async function handleCreateSession(request: Request, env: Env) {
  const authorization = request.headers.get("Authorization");
  const token = authorization?.startsWith("Bearer ") ? authorization.slice(7) : "";
  const userId = await authenticateAppleToken(token, env);
  if (!userId) return json({ ok: false, error: "Invalid Apple identity token." }, { status: 401 });

  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const sessionToken = btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(sessionToken));
  const tokenHash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  await env.DB.prepare(
    "INSERT INTO sync_sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)",
  ).bind(tokenHash, userId, Math.floor(Date.now() / 1000) + 31_536_000).run();
  return json({ ok: true, sessionToken });
}

function isSnapshot(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object") return false;
  const snapshot = value as Record<string, unknown>;
  return snapshot.version === 1 &&
    ["profiles", "challenges", "habits", "habit_completions", "daily_focus", "daily_affirmations"]
      .every((key) => Array.isArray(snapshot[key]));
}

async function handleSync(request: Request, env: Env) {
  const userId = await authenticate(request, env);
  if (!userId) return json({ ok: false, error: "Invalid Apple identity token." }, { status: 401 });

  if (request.method === "GET") {
    const row = await env.DB.prepare("SELECT snapshot FROM user_snapshots WHERE user_id = ? LIMIT 1")
      .bind(userId).first<{ snapshot: string }>();
    if (!row) return json({ ok: false, error: "No backup found." }, { status: 404 });
    return json(JSON.parse(row.snapshot));
  }

  let payload: unknown;
  try { payload = await request.json(); } catch { return badRequest("Invalid JSON body."); }
  if (!isSnapshot(payload)) return badRequest("Invalid backup payload.");
  const serialized = JSON.stringify(payload);
  if (serialized.length > 1_500_000) return badRequest("Backup is too large.");

  await env.DB.prepare(
    `INSERT INTO user_snapshots (user_id, snapshot, updated_at) VALUES (?, ?, datetime('now'))
     ON CONFLICT(user_id) DO UPDATE SET snapshot = excluded.snapshot, updated_at = excluded.updated_at`,
  ).bind(userId, serialized).run();
  return json({ ok: true });
}

const MEDIA_KINDS: Record<string, { contentType: string; maxBytes: number }> = {
  focus: { contentType: "video/mp4", maxBytes: 100_000_000 },
  "habit-photo": { contentType: "image/jpeg", maxBytes: 15_000_000 },
  "journal-photo": { contentType: "image/jpeg", maxBytes: 15_000_000 },
};

function isMediaId(value: string) {
  return /^[a-zA-Z0-9_-]{1,64}$/.test(value);
}

function mediaKey(userId: string, kind: string, id: string) {
  return `${userId}/${kind}/${id}`;
}

async function handleMediaGet(request: Request, env: Env, kind: string, id: string) {
  const config = MEDIA_KINDS[kind];
  if (!config) return badRequest("Unknown media kind.");
  const userId = await authenticate(request, env);
  if (!userId) return json({ ok: false, error: "Invalid Apple identity token." }, { status: 401 });
  if (!isMediaId(id)) return badRequest("Invalid media id.");

  const object = await env.MEDIA.get(mediaKey(userId, kind, id));
  if (!object) return json({ ok: false, error: "Not found." }, { status: 404 });

  return new Response(object.body, {
    headers: {
      ...CORS_HEADERS,
      "Content-Type": object.httpMetadata?.contentType ?? config.contentType,
      "Content-Length": String(object.size),
    },
  });
}

async function handleMediaPut(request: Request, env: Env, kind: string, id: string) {
  const config = MEDIA_KINDS[kind];
  if (!config) return badRequest("Unknown media kind.");
  const userId = await authenticate(request, env);
  if (!userId) return json({ ok: false, error: "Invalid Apple identity token." }, { status: 401 });
  if (!isMediaId(id)) return badRequest("Invalid media id.");

  const contentLength = Number(request.headers.get("Content-Length") ?? "0");
  if (!contentLength || contentLength > config.maxBytes) {
    return badRequest("Media is missing or too large.");
  }

  await env.MEDIA.put(mediaKey(userId, kind, id), request.body, {
    httpMetadata: { contentType: config.contentType },
  });
  return json({ ok: true }, { status: 201 });
}

async function handleMediaDelete(request: Request, env: Env, kind: string, id: string) {
  const config = MEDIA_KINDS[kind];
  if (!config) return badRequest("Unknown media kind.");
  const userId = await authenticate(request, env);
  if (!userId) return json({ ok: false, error: "Invalid Apple identity token." }, { status: 401 });
  if (!isMediaId(id)) return badRequest("Invalid media id.");

  await env.MEDIA.delete(mediaKey(userId, kind, id));
  return json({ ok: true });
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
  const result = await env.AI.run("@cf/meta/llama-3.1-8b-instruct-fp8", {
    messages: [
      {
        role: "system",
        content:
          "You write very short daily affirmations for a focus and habit-building app. Return exactly one short sentence, no quotes, no emoji, no markdown.",
      },
      {
        role: "user",
        content:
          `Generate a warm, grounded affirmation for ${date}. It must be original, 5 to 10 words max, first person, practical, and not cheesy.`,
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
    try {
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

      if (request.method === "POST" && url.pathname === "/api/auth/session") {
        return handleCreateSession(request, env);
      }

      if ((request.method === "GET" || request.method === "PUT") && url.pathname === "/api/sync") {
        return handleSync(request, env);
      }

      const mediaMatch = url.pathname.match(/^\/api\/media\/([^/]+)\/([^/]+)$/);
      if (mediaMatch) {
        const [, kind, id] = mediaMatch;
        if (request.method === "GET") return handleMediaGet(request, env, kind, id);
        if (request.method === "PUT") return handleMediaPut(request, env, kind, id);
        if (request.method === "DELETE") return handleMediaDelete(request, env, kind, id);
      }

      return json({ ok: false, error: "Not found." }, { status: 404 });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Worker request failed.";
      return json({ ok: false, error: message }, { status: 500 });
    }
  },
};
