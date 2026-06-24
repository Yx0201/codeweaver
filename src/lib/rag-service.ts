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
2. 每个关键陈述必须标注来源编号，使用半角方括号包裹纯数字，如 [1]、[2]；如果一句话引用了多条参考，按 [1][3] 的形式并列写
3. 只能引用上方真实出现过的编号，绝不要编造或猜测编号；如果某条信息没有对应的参考，不要标注引用
4. 不要在正文中重复参考资料的标题或编号说明，引用列表会自动渲染在回答下方
5. 如果多个参考资料互相矛盾，请指出矛盾之处
6. 如果参考资料中没有足够信息回答问题，请明确说明"根据现有资料无法回答"
7. 先给出直接回答，再补充相关细节

参考资料（共 ${contexts.length} 条，编号从 1 开始）：
${contextText}`;
}

/**
 * System prompt for Agent mode. Unlike `buildRagSystemPrompt`, the context is
 * NOT injected up front — the model fetches it on demand via the
 * `retrieveKnowledge` tool and decides for itself when it has enough.
 *
 * The loaded knowledge base's name/description ARE passed in, because unlike
 * pipeline mode (where chunks are injected and the model sees the content
 * directly), the agent has no other signal that a KB is loaded. Without this,
 * references like "这本小说/这本书/这个文档" read as ambiguous and the model
 * asks the user "which one?" instead of retrieving.
 *
 * Citation numbering is global across all tool calls: every chunk a tool call
 * returns carries a `number` field, and those numbers are the `[N]` markers the
 * model must use in its answer.
 */
export function buildAgentSystemPrompt(
  kbName?: string,
  kbDescription?: string | null
): string {
  const kbLine = kbName
    ? `当前已加载知识库:《${kbName}》${kbDescription ? `(${kbDescription})` : ""}。用户问题中出现的"这本小说/这本书/这个文档/它"等指代,一律指该知识库的内容——不要反问用户"是哪一本/哪一个",直接检索该知识库来回答。`
    : `当前已加载一个知识库。用户问题中出现的"这本小说/这本书/这个文档/它"等指代,一律指该知识库的内容,直接检索即可。`;

  return `你是一个具备检索能力的知识库问答助手。你可以调用 \`retrieveKnowledge\` 工具按需检索知识库,自主决定检索策略。

${kbLine}

工作方式:
1. 先分析用户问题,判断需要检索什么。你可以改写、具体化或拆分查询,把它作为 \`query\` 传给工具。
2. **多方面的问题要拆分检索**:例如问"世界观和主要人物",应分别用"世界观/背景设定""主要人物/角色"等针对性查询各检索一次,而不是把所有词堆进一个泛查询。泛查询(如"小说 世界观 介绍")往往召回为 0。
3. **query 要用正文里可能出现的词**,不要用关于内容的元词(如"介绍/主要/情节"这类描述性词)。不确定时,先用知识库名或一个宽泛的主题词试探,再据返回结果缩窄。
4. 通过 \`searchMode\` 选择检索通道:hybrid(三路融合+重排,适合综合问题,默认)、graph(基于知识图谱,适合实体/关系问题)、fast(关键词+向量,速度优先)。
5. 每次工具调用会返回带 \`number\` 编号的片段。这些编号是全局连续的(第一次调用返回 [1][2]…,第二次接着编号),回答时必须用这些编号标注来源,如 [1]、[2][3]。
6. 看完返回的片段后自主判断:信息充分就回答;不够就**换一种 query 措辞再次检索**,不要盲目重复相同查询。某次召回 0 不代表知识库没有相关内容,换个角度再试。
7. 信息充分后,直接给出回答,用 [N] 引用对应片段。回答要清晰、先给结论再补充细节。
8. 如果多次换词检索后仍无足够信息,明确说明"根据现有资料无法回答",不要编造。
9. 非知识库相关问题(闲聊、通用常识)可直接回答,无需调用工具。

记住:工具返回片段中的 \`number\` 就是你在回答中要使用的引用编号 [number]。`;
}
