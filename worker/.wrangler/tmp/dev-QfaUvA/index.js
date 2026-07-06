var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/index.ts
var CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};
function json(body, init = {}) {
  return Response.json(body, {
    ...init,
    headers: {
      ...CORS_HEADERS,
      ...init.headers
    }
  });
}
__name(json, "json");
function badRequest(message) {
  return json({ ok: false, error: message }, { status: 400 });
}
__name(badRequest, "badRequest");
function isString(value) {
  return typeof value === "string";
}
__name(isString, "isString");
function isDateKey(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}
__name(isDateKey, "isDateKey");
function cleanAffirmation(value) {
  return value.replace(/^["“”'`]+|["“”'`]+$/g, "").replace(/\s+/g, " ").trim().slice(0, 180);
}
__name(cleanAffirmation, "cleanAffirmation");
function parseSubmission(value) {
  if (!value || typeof value !== "object") return null;
  const data = value;
  const profileId = typeof data.profileId === "number" || data.profileId === null ? data.profileId : null;
  if (!isString(data.name) || !isString(data.avatar) || !Array.isArray(data.painPoints) || !data.painPoints.every(isString) || !isString(data.mainGoal) || !isString(data.keystoneHabit) || !isString(data.referralSource) || !isString(data.completedAt)) {
    return null;
  }
  return {
    profileId,
    name: data.name.slice(0, 120),
    avatar: data.avatar.slice(0, 120),
    painPoints: data.painPoints.slice(0, 3).map((item) => item.slice(0, 240)),
    mainGoal: data.mainGoal.slice(0, 1e3),
    keystoneHabit: data.keystoneHabit.slice(0, 120),
    referralSource: data.referralSource.slice(0, 120),
    completedAt: data.completedAt
  };
}
__name(parseSubmission, "parseSubmission");
async function handleOnboarding(request, env) {
  let payload;
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
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    submission.profileId,
    submission.name,
    submission.avatar,
    JSON.stringify(submission.painPoints),
    submission.mainGoal,
    submission.keystoneHabit,
    submission.referralSource,
    submission.completedAt
  ).run();
  return json({ ok: true }, { status: 201 });
}
__name(handleOnboarding, "handleOnboarding");
async function generateAffirmation(env, date) {
  const result = await env.AI.run("@cf/meta/llama-3.1-8b-instruct-fp8", {
    messages: [
      {
        role: "system",
        content: "You write concise daily affirmations for a focus and habit-building app. Return exactly one sentence, no quotes, no emoji, no markdown."
      },
      {
        role: "user",
        content: `Generate a warm, grounded affirmation for ${date}. It should be original, 8 to 18 words, first person, practical, and not cheesy.`
      }
    ],
    max_tokens: 48,
    temperature: 0.8
  });
  const response = typeof result.response === "string" ? result.response : "";
  const affirmation = cleanAffirmation(response);
  if (!affirmation) {
    throw new Error("Workers AI returned an empty affirmation.");
  }
  return affirmation;
}
__name(generateAffirmation, "generateAffirmation");
async function handleAffirmation(request, env) {
  const url = new URL(request.url);
  const date = url.searchParams.get("date") ?? "";
  if (!isDateKey(date)) {
    return badRequest("Invalid date. Expected YYYY-MM-DD.");
  }
  const existing = await env.DB.prepare(
    "SELECT text FROM daily_affirmations WHERE date = ? LIMIT 1"
  ).bind(date).first();
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
        updated_at = CURRENT_TIMESTAMP`
  ).bind(date, affirmation).run();
  return json({ ok: true, affirmation, source: "workers-ai" }, { status: 201 });
}
__name(handleAffirmation, "handleAffirmation");
var src_default = {
  async fetch(request, env) {
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
      return json({ ok: false, error: "Not found." }, { status: 404 });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Worker request failed.";
      return json({ ok: false, error: message }, { status: 500 });
    }
  }
};

// node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    return Response.json(error, {
      status: 500,
      headers: { "MF-Experimental-Error-Stack": "true" }
    });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// .wrangler/tmp/bundle-tmsA6r/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = src_default;

// node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-tmsA6r/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=index.js.map
