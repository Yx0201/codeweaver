import { generateText } from "ai";
import { createOllama } from "ollama-ai-provider-v2";
import { OLLAMA_BASE_URL } from "./config";

const ollama = createOllama({ baseURL: OLLAMA_BASE_URL });
const rewriterModel = ollama("qwen3:0.6b");

export type RewriteMode = "rewrite" | "hyde" | "expand";

export interface RewrittenQuery {
  original: string;
  rewritten: string;
  subQueries?: string[];
  hypotheticalAnswer?: string;
}

/**
 * Rewrite a user query into a more search-friendly form.
 *
 * Modes:
 * - `rewrite`: Reformulate the query to be more formal and keyword-rich.
 * - `hyde`: Generate a hypothetical answer, then use it for vector search.
 * - `expand`: Break the query into 2-3 sub-queries for broader retrieval.
 */
export async function rewriteQuery(
  query: string,
  mode: RewriteMode = "hyde"
): Promise<RewrittenQuery> {
  try {
    switch (mode) {
      case "rewrite":
        return await rewriteMode(query);
      case "hyde":
        return await hydeMode(query);
      case "expand":
        return await expandMode(query);
      default:
        return { original: query, rewritten: query };
    }
  } catch (err) {
    console.error("Query rewriting failed, using original query:", err);
    return { original: query, rewritten: query };
  }
}

async function rewriteMode(query: string): Promise<RewrittenQuery> {
  const { text } = await generateText({
    model: rewriterModel,
    prompt: `你是一个查询改写助手。请将以下用户查询改写为更适合检索的形式：保留关键信息，使用更正式的词汇，去掉口语化表达。只输出改写后的查询，不要解释。

原始查询：${query}

改写后的查询：`,
    maxOutputTokens: 200,
  });

  return { original: query, rewritten: text.trim() || query };
}

async function hydeMode(query: string): Promise<RewrittenQuery> {
  const { text } = await generateText({
    model: rewriterModel,
    prompt: `请根据以下问题，写一段可能包含答案的假设性文档段落。这段文字将被用于语义检索，所以请尽量使用专业术语和详细描述，不需要完全正确，但要和相关领域高度相关。只输出假设性文档，不要解释。

问题：${query}

假设性文档：`,
    maxOutputTokens: 300,
  });

  const hypotheticalAnswer = text.trim();
  return {
    original: query,
    rewritten: hypotheticalAnswer || query,
    hypotheticalAnswer,
  };
}

async function expandMode(query: string): Promise<RewrittenQuery> {
  const { text } = await generateText({
    model: rewriterModel,
    prompt: `请将以下查询拆分为2-3个更具体的子查询，每个子查询关注原查询的一个方面。每行输出一个子查询，不要编号，不要解释。

原始查询：${query}

子查询：`,
    maxOutputTokens: 300,
  });

  const subQueries = text
    .split("\n")
    .map((s) => s.replace(/^\d+[.、)\s]*/, "").trim())
    .filter((s) => s.length > 0)
    .slice(0, 3);

  return {
    original: query,
    rewritten: query,
    subQueries: subQueries.length > 0 ? subQueries : undefined,
  };
}
