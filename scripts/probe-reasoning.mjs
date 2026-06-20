/**
 * Probe whether the chat provider actually emits a reasoning stream.
 *
 * Run from the project root:
 *   node --env-file=.env.local scripts/probe-reasoning.mjs
 *   (fall back to --env-file=.env if .env.local has no creds)
 *
 * Prints two blocks:
 *   1. RAW  — the raw SSE deltas, flagging any reasoning_content / reasoning
 *             field. This is the ground truth: if nothing shows up here, the
 *             upstream model/gateway is not emitting reasoning at all and M4
 *             cannot be wired up regardless of SDK handling.
 *   2. SDK  — the same request through the AI SDK streamText fullStream, listing
 *             every part.type. A `reasoning` part here means the whole chain
 *             (provider → SDK → client) carries reasoning and M4 is ready.
 *
 * The probe uses an explicitly reasoning-prone prompt and, where the gateway
 * accepts it, nudges reasoning on via the providerOptions / extra_body knobs.
 */
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { streamText } from "ai";

const BASE_URL = process.env.ZENMUX_BASE_URL ?? process.env.RAGAS_EVAL_BASE_URL;
const API_KEY = process.env.ZENMUX_API_KEY ?? process.env.RAGAS_EVAL_API_KEY;
const MODEL = process.env.CHAT_MODEL ?? "deepseek/deepseek-v4-flash";

if (!BASE_URL || !API_KEY) {
  console.error("Missing ZENMUX_BASE_URL / ZENMUX_API_KEY — check --env-file");
  process.exit(1);
}

const PROMPT = "9.11 和 9.9 哪个大?请一步一步仔细推理后再给结论。";

console.log(`endpoint: ${BASE_URL}`);
console.log(`model:    ${MODEL}`);
console.log(`prompt:   ${PROMPT}\n`);

// ── 1. RAW SSE probe ────────────────────────────────────────────────────────
console.log("══ 1. RAW SSE ══");
let rawReasoningChars = 0;
let rawContentChars = 0;
let firstReasoningField = null;
let rawDeltasInspected = 0;

const rawRes = await fetch(`${BASE_URL.replace(/\/$/, "")}/chat/completions`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${API_KEY}`,
  },
  body: JSON.stringify({
    model: MODEL,
    stream: true,
    // Nudge reasoning on for gateways that honor it (no-op for those that don't).
    reasoning_effort: "medium",
    messages: [{ role: "user", content: PROMPT }],
  }),
});

if (!rawRes.ok || !rawRes.body) {
  console.error(`raw request failed: HTTP ${rawRes.status}`);
  console.error(await rawRes.text().catch(() => "<no body>"));
} else {
  let buf = "";
  for await (const chunk of rawRes.body) {
    buf += chunk.toString();
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice(5).trim();
      if (payload === "[DONE]") continue;
      let json;
      try {
        json = JSON.parse(payload);
      } catch {
        continue;
      }
      const delta = json.choices?.[0]?.delta ?? {};
      // Cover DeepSeek (reasoning_content) and OpenAI/o-series (reasoning).
      const r = delta.reasoning_content ?? delta.reasoning;
      if (r) {
        rawReasoningChars += r.length;
        if (!firstReasoningField)
          firstReasoningField = delta.reasoning_content ? "reasoning_content" : "reasoning";
        if (rawReasoningChars <= 120) process.stdout.write(`  R| ${r}`);
      }
      if (delta.content) rawContentChars += delta.content.length;
      // Dump the first few deltas that carry any non-content key, so we can
      // spot whatever field name this gateway actually uses for reasoning.
      if (rawDeltasInspected < 3 && Object.keys(delta).length > 0) {
        const nonContent = Object.fromEntries(
          Object.entries(delta).filter(([k]) => k !== "content")
        );
        if (Object.keys(nonContent).length > 0) {
          console.log(`  raw delta#${rawDeltasInspected} keys:`, Object.keys(delta).join(","), nonContent);
          rawDeltasInspected++;
        }
      }
    }
  }
  console.log(
    `\n  → reasoning chars: ${rawReasoningChars}` +
      (firstReasoningField ? ` (field: ${firstReasoningField})` : "") +
      `\n  → content chars:   ${rawContentChars}`
  );
  if (rawReasoningChars === 0)
    console.log("  ⚠ 上游未吐 reasoning —— M4 在该模型/网关下无法落地。");
}

// ── 2. AI SDK probe ─────────────────────────────────────────────────────────
console.log("\n══ 2. AI SDK streamText ══");
try {
  const zenmux = createOpenAICompatible({
    name: "zenmux",
    baseURL: BASE_URL,
    apiKey: API_KEY,
  });
  const model = zenmux(MODEL);

  const { fullStream } = streamText({
    model,
    prompt: PROMPT,
    // Mirror the same nudge; ignored by providers that don't support it.
    providerOptions: { openaiCompatible: { reasoningEffort: "medium" } },
  });

  const seenTypes = new Map();
  let reasoningText = "";
  let reasoningPartSeen = false;
  for await (const part of fullStream) {
    seenTypes.set(part.type, (seenTypes.get(part.type) ?? 0) + 1);
    // v2 spec streams reasoning as reasoning-start / reasoning-delta / reasoning-end.
    if (part.type === "reasoning-delta" || part.type === "reasoning") {
      reasoningPartSeen = true;
      reasoningText += part.text ?? part.delta ?? "";
    }
    if (part.type === "error") {
      console.error("  SDK error part:", part);
    }
  }
  console.log("  part types:", [...seenTypes.entries()].map(([t, n]) => `${t}×${n}`).join(", "));
  console.log(`  reasoning text chars: ${reasoningText.length}`);
  if (reasoningText)
    console.log(`  reasoning preview: ${reasoningText.slice(0, 120)}`);
  if (reasoningPartSeen) console.log("  ✓ AI SDK 已产出 reasoning 流式 part —— M4 可直接接入。");
  else console.log("  ⚠ AI SDK 未产出 reasoning part(即便上游有,provider 也未映射)。");
} catch (err) {
  console.error("  SDK probe threw:", err);
}
