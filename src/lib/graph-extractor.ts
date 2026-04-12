import { generateText } from "ai";
import { createOllama } from "ollama-ai-provider-v2";
import { OLLAMA_BASE_URL } from "./config";
import { z } from "zod";

const ollama = createOllama({ baseURL: OLLAMA_BASE_URL });
const extractorModel = ollama("qwen3:8b");

const entitySchema = z.object({
  name: z.string(),
  entity_type: z.enum(["person", "location", "organization", "event", "concept"]),
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

/**
 * Extract entities and relations from a text chunk using LLM.
 * Uses structured output with Zod validation.
 */
export async function extractEntitiesAndRelations(
  chunkText: string
): Promise<ExtractionResult> {
  try {
    const { text } = await generateText({
      model: extractorModel,
      prompt: `从以下文本中提取实体和关系。只提取明确提到的实体和关系，不要推测。

文本：
${chunkText}

请以JSON格式输出，格式如下：
{
  "entities": [
    {"name": "实体名", "entity_type": "person|location|organization|event|concept", "description": "简要描述"}
  ],
  "relations": [
    {"source": "源实体名", "target": "目标实体名", "relation": "关系类型", "description": "关系描述"}
  ]
}

只输出JSON，不要解释。如果没有实体或关系，返回空数组。`,
      maxOutputTokens: 1000,
    });

    // Parse JSON from the response — handle <think/> tags from qwen3
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { entities: [], relations: [] };
    }

    const parsed = extractionSchema.safeParse(JSON.parse(jsonMatch[0]));
    if (!parsed.success) {
      console.error("Entity extraction parse error:", parsed.error.message);
      return { entities: [], relations: [] };
    }

    return parsed.data;
  } catch (err) {
    console.error("Entity extraction failed:", err);
    return { entities: [], relations: [] };
  }
}

/**
 * Extract just entity names from a query (lightweight, for search).
 */
export async function extractQueryEntities(query: string): Promise<string[]> {
  try {
    const { text } = await generateText({
      model: extractorModel,
      prompt: `从以下查询中提取关键实体名称。每行输出一个实体名，不要编号，不要解释。

查询：${query}

实体：`,
      maxOutputTokens: 200,
    });

    return text
      .split("\n")
      .map((s) => s.replace(/^\d+[.、)\s]*/, "").trim())
      .filter((s) => s.length > 0)
      .slice(0, 5);
  } catch (err) {
    console.error("Query entity extraction failed:", err);
    return [];
  }
}
