/**
 * Shared RAG service logic.
 * Used by both the streaming chat endpoint and the standalone API routes
 * to ensure identical behavior for users and the evaluation script.
 */

/**
 * Build the RAG system prompt from retrieved context chunks.
 * This is the exact same prompt construction used in the chat flow.
 */
export function buildRagSystemPrompt(contexts: string[]): string {
  const contextText = contexts
    .map((c, i) => `[${i + 1}] ${c}`)
    .join("\n\n");

  return `你是一个知识库问答助手。请根据以下参考资料回答用户的问题。如果参考资料中没有相关信息，请如实告知。\n\n参考资料：\n${contextText}`;
}
