/**
 * Shared RAG service logic.
 * Used by both the streaming chat endpoint and the standalone API routes
 * to ensure identical behavior for users and the evaluation script.
 */

/**
 * Build the RAG system prompt from retrieved context chunks.
 * Enforces citation discipline and structured answering.
 */
export function buildRagSystemPrompt(contexts: string[]): string {
  const contextText = contexts
    .map((c, i) => `[${i + 1}] ${c}`)
    .join("\n\n");

  return `你是一个知识库问答助手。请严格遵守以下规则回答用户的问题：

1. 回答必须基于参考资料中的信息，不要编造内容
2. 每个关键陈述必须标注来源编号，如[1]、[2]
3. 如果多个参考资料互相矛盾，请指出矛盾之处
4. 如果参考资料中没有足够信息回答问题，请明确说明"根据现有资料无法回答"
5. 先给出直接回答，再补充相关细节

参考资料：
${contextText}`;
}
