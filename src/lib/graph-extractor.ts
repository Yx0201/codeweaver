import {
  GRAPH_EXTRACT_API_BASE_URL,
  GRAPH_EXTRACT_API_KEY,
  GRAPH_EXTRACT_CLOUD_MODEL,
} from "./config";
import { jsonrepair } from "jsonrepair";
import { z } from "zod";

const ENTITY_TYPE_VALUES = [
  "person",
  "location",
  "organization",
  "event",
  "concept",
] as const;

type CanonicalEntityType = (typeof ENTITY_TYPE_VALUES)[number];


const graphExtractSystemPrompt = `
你是知识图谱抽取器。
任务：从给定文本中抽取实体和关系。
只输出 JSON，不要解释，不要 Markdown，不要推理过程，不要 thinking。

实体类型只能使用以下 5 个英文值：
- person：人物、角色
- location：地点、地名
- organization：组织、势力、机构
- event：事件、行动、冲突
- concept：概念、物品、能力、术语、设定

请严格按照下面模板填写值，不要新增字段，不要省略顶层字段：
{
  "entities": [
    {
      "name": "实体名称",
      "entity_type": "person",
      "description": "对实体的简要说明"
    }
  ],
  "relations": [
    {
      "source": "实体A",
      "target": "实体B",
      "relation": "关系名称",
      "description": "原文中的关系证据"
    }
  ]
}

命名规范（非常重要）：
- 实体 name 必须使用文中最完整、最正式的名称（全名优先于昵称/简称/代称）
- 同一实体的昵称、绰号、简称、代称要归一到同一个正式名称，不要输出为多个实体
- 不要把代词（他、她、它、对方、那人）当成实体
- relation 用 2~6 个字的动词短语（如「父亲是」「位于」「属于」「参与」「拥有」），不要写完整句子

限制：
- 最多输出 20 个 entities
- 最多输出 30 个 relations
- description 尽量简洁，每条不超过 40 个字
- 如果没有可抽取内容，输出 {"entities":[],"relations":[]}
`.trim();

const graphExtractJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["entities", "relations"],
  properties: {
    entities: {
      type: "array",
      maxItems: 20,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "entity_type"],
        properties: {
          name: { type: "string" },
          entity_type: {
            type: "string",
            enum: [...ENTITY_TYPE_VALUES],
          },
          description: { type: "string" },
        },
      },
    },
    relations: {
      type: "array",
      maxItems: 30,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["source", "target", "relation"],
        properties: {
          source: { type: "string" },
          target: { type: "string" },
          relation: { type: "string" },
          description: { type: "string" },
        },
      },
    },
  },
} as const;

const queryEntitySystemPrompt = `
你是查询实体提取器。
只输出纯文本，每行一个实体名称。
不要编号，不要解释，不要 thinking。
如果没有实体，输出空字符串。
`.trim();

function buildGraphExtractPrompt(chunkText: string): string {
  return `
请从下面这段小说文本中抽取知识图谱实体和关系。
请直接在给定 JSON 模板中填写值。

文本：
${chunkText}
`.trim();
}

const entitySchema = z.object({
  name: z.string(),
  entity_type: z.enum(ENTITY_TYPE_VALUES),
  description: z.string().optional(),
});

const relationSchema = z.object({
  source: z.string(),
  target: z.string(),
  relation: z.string(),
  description: z.string().optional(),
});

const extractionSchema = z.object({
  entities: z.array(entitySchema),
  relations: z.array(relationSchema),
});

export type ExtractedEntity = z.infer<typeof entitySchema>;
export type ExtractedRelation = z.infer<typeof relationSchema>;

export interface ExtractionResult {
  entities: ExtractedEntity[];
  relations: ExtractedRelation[];
}

function normalizeEntityType(value: unknown): CanonicalEntityType {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";

  switch (normalized) {
    case "person":
    case "人物":
    case "角色":
    case "人":
    case "character":
      return "person";
    case "location":
    case "地点":
    case "地名":
    case "地域":
    case "place":
      return "location";
    case "organization":
    case "组织":
    case "机构":
    case "势力":
    case "团体":
    case "组织机构":
      return "organization";
    case "event":
    case "事件":
    case "剧情":
    case "行动":
    case "冲突":
      return "event";
    case "concept":
    case "概念":
    case "物品":
    case "道具":
    case "能力":
    case "术语":
    case "设定":
    case "object":
    case "item":
      return "concept";
    default:
      return "concept";
  }
}

function sanitizeString(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value
    .replace(/```/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/\u0000/g, "")
    .trim();

  if (!normalized) {
    return undefined;
  }

  return normalized.slice(0, maxLength);
}

function normalizeExtractionResult(payload: unknown): unknown {
  if (!payload || typeof payload !== "object") {
    return payload;
  }

  const record = payload as {
    entities?: Array<Record<string, unknown>>;
    relations?: Array<Record<string, unknown>>;
  };

  return {
    entities: Array.isArray(record.entities)
      ? record.entities
          .map((entity) => ({
            name: sanitizeString(entity.name, 120),
            entity_type: normalizeEntityType(entity.entity_type),
            description: sanitizeString(entity.description, 80),
          }))
          .filter((entity) => entity.name)
      : [],
    relations: Array.isArray(record.relations)
      ? record.relations
          .map((relation) => ({
            source: sanitizeString(relation.source, 120),
            target: sanitizeString(relation.target, 120),
            relation: sanitizeString(relation.relation, 80),
            description: sanitizeString(relation.description, 80),
          }))
          .filter(
            (relation) =>
              relation.source &&
              relation.target &&
              relation.relation
          )
      : [],
  };
}

// ---------------------------------------------------------------------------
// Cloud (OpenAI-compatible) extraction path with rate-limit aware retries
// ---------------------------------------------------------------------------

/** Count of 429 responses observed since last consume — used by the
 *  adaptive concurrency controller in the graph-build pipeline. */
let rateLimitHits = 0;

export function consumeRateLimitHits(): number {
  const hits = rateLimitHits;
  rateLimitHits = 0;
  return hits;
}

const CLOUD_MAX_RETRIES = 5;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Call the cloud chat-completions endpoint with exponential backoff + jitter.
 * Honors Retry-After on 429; retries 429/5xx/network errors; thinking disabled.
 */
async function callCloudChat(
  messages: Array<{ role: string; content: string }>,
  options: { maxTokens?: number; jsonMode?: boolean } = {}
): Promise<string> {
  const { maxTokens = 2048, jsonMode = true } = options;
  let lastError: unknown = null;

  for (let attempt = 0; attempt <= CLOUD_MAX_RETRIES; attempt += 1) {
    try {
      const response = await fetch(`${GRAPH_EXTRACT_API_BASE_URL}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${GRAPH_EXTRACT_API_KEY}`,
        },
        body: JSON.stringify({
          model: GRAPH_EXTRACT_CLOUD_MODEL,
          messages,
          ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
          // DeepSeek v4: disable reasoning/thinking — faster, and structured
          // output otherwise lands in the `reasoning` field instead of content.
          thinking: { type: "disabled" },
          temperature: 0,
          max_tokens: maxTokens,
          stream: false,
        }),
        signal: AbortSignal.timeout(120_000),
      });

      if (response.status === 429 || response.status >= 500) {
        if (response.status === 429) rateLimitHits += 1;
        const retryAfterHeader =
          response.headers.get("retry-after-ms") ??
          response.headers.get("retry-after");
        let waitMs = 2 ** attempt * 1000 + Math.random() * 1000;
        if (retryAfterHeader) {
          const parsed = Number.parseFloat(retryAfterHeader);
          if (Number.isFinite(parsed)) {
            waitMs = response.headers.get("retry-after-ms")
              ? parsed
              : parsed * 1000;
          }
        }
        lastError = new Error(
          `云端图谱抽取请求被限流/出错: ${response.status} ${response.statusText}`
        );
        if (attempt < CLOUD_MAX_RETRIES) {
          await sleep(waitMs);
          continue;
        }
        throw lastError;
      }

      if (!response.ok) {
        const bodyText = await response.text().catch(() => "");
        throw new Error(
          `云端图谱抽取请求失败: ${response.status} ${response.statusText} ${bodyText.slice(0, 200)}`
        );
      }

      const data = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const text = data.choices?.[0]?.message?.content?.trim();
      if (!text) {
        throw new Error("云端图谱抽取返回为空");
      }
      return text;
    } catch (error) {
      lastError = error;
      const isAbort =
        error instanceof Error &&
        (error.name === "TimeoutError" || error.name === "AbortError");
      const isNetwork = error instanceof TypeError;
      if ((isAbort || isNetwork) && attempt < CLOUD_MAX_RETRIES) {
        await sleep(2 ** attempt * 1000 + Math.random() * 1000);
        continue;
      }
      throw error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("云端图谱抽取失败");
}

async function repairExtractionJson(rawResponse: string, errorMessage: string): Promise<string> {
  return callCloudChat(
    [
      { role: "system", content: graphExtractSystemPrompt },
      {
        role: "user",
        content: `下面这段 JSON 不合法，请修正成一个严格合法的 JSON。
不要解释，不要 Markdown，只输出 JSON 本体。

错误信息：
${errorMessage}

错误 JSON：
${rawResponse}`.trim(),
      },
    ],
    { jsonMode: true }
  );
}

async function parseExtractionPayload(rawResponse: string): Promise<unknown> {
  try {
    return JSON.parse(rawResponse);
  } catch (error) {
    const message = error instanceof Error ? error.message : "未知 JSON 解析错误";

    try {
      return JSON.parse(jsonrepair(rawResponse));
    } catch {
      // Fall through to model-based repair.
    }

    const repairedJson = await repairExtractionJson(rawResponse, message);

    try {
      return JSON.parse(repairedJson);
    } catch (repairError) {
      try {
        return JSON.parse(jsonrepair(repairedJson));
      } catch {
        // Keep the original repair failure below for debugging.
      }

      const repairMessage =
        repairError instanceof Error ? repairError.message : "未知 JSON 解析错误";
      throw new Error(
        `图谱抽取 JSON 解析失败: ${message}；自动修复后仍解析失败: ${repairMessage}`
      );
    }
  }
}

export async function extractEntitiesAndRelations(
  chunkText: string
): Promise<ExtractionResult> {
  return extractEntitiesAndRelationsCloud(chunkText);
}

async function extractEntitiesAndRelationsCloud(
  chunkText: string
): Promise<ExtractionResult> {
  const text = await callCloudChat([
    { role: "system", content: graphExtractSystemPrompt },
    { role: "user", content: buildGraphExtractPrompt(chunkText) },
  ]);

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(text);
  } catch {
    parsedJson = JSON.parse(jsonrepair(text));
  }

  const normalized = normalizeExtractionResult(parsedJson);
  const parsed = extractionSchema.safeParse(normalized);

  if (!parsed.success) {
    throw new Error(`图谱抽取结果结构校验失败: ${parsed.error.message}`);
  }

  return parsed.data;
}

export async function extractQueryEntities(query: string): Promise<string[]> {
  try {
    const text = await callCloudChat(
      [
        { role: "system", content: queryEntitySystemPrompt },
        { role: "user", content: `查询：${query}\n\n请提取关键实体：` },
      ],
      { maxTokens: 128, jsonMode: false }
    );

    return text
      .split("\n")
      .map((line) => line.replace(/^\d+[.、)\s]*/, "").trim())
      .filter((line) => line.length > 0)
      .slice(0, 5);
  } catch (error) {
    console.error("Query entity extraction failed:", error);
    return [];
  }
}
