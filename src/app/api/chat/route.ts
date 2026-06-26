import {
  streamText,
  generateText,
  createUIMessageStream,
  createUIMessageStreamResponse,
  stepCountIs,
} from "ai";
import { chatModel } from "@/register/model";
import { buildAgentSystemPrompt, buildRagSystemPrompt } from "@/lib/rag-service";
import { prisma } from "@/lib/prisma";
import { DEFAULT_VECTOR_TOP_K, DEFAULT_KEYWORD_TOP_K, DEFAULT_FINAL_TOP_K } from "@/lib/config";
import type { RewriteMode } from "@/lib/query-rewriter";
import { searchKnowledgeBase } from "@/lib/search-service";
import {
  buildSnippet,
  type AgentTraceStep,
  type AssistantMessageMetadata,
  type MessageReference,
} from "@/lib/citations";
import type { TraceCallback, TraceStep } from "@/lib/trace";
import { buildIntro, type ChatUIMessage } from "@/lib/chat-stream";
import { createRetrieveTool } from "@/lib/agent-tools";
import type { RetrievalMode } from "@/lib/search-service";
import { requireUserId, unauthorized } from "@/lib/auth-guard";

/** Max agent loop iterations — the safety guardrail against runaway loops. */
const AGENT_MAX_STEPS = 6;

export const maxDuration = 60;

/** Round a retrieval/rerank score to 4dp for compact storage + display. */
function roundScore(n: number): number {
  return Math.round(n * 10000) / 10000;
}

/** Message in UIMessage format (from @ai-sdk/react) */
interface UIMessageInput {
  role: "user" | "assistant" | "system";
  parts?: { type: string; text?: string }[];
  content?: string;
}

/** Message in simple format (from Python eval script) */
interface SimpleMessageInput {
  role: "user" | "assistant" | "system";
  content: string;
}

type ChatMessageInput = UIMessageInput | SimpleMessageInput;

/**
 * Extract text from a message, supporting both UIMessage format (with parts)
 * and simple {role, content} format (from the Python eval script).
 */
function extractMessageText(msg: ChatMessageInput): string {
  if ("parts" in msg && msg.parts) {
    return msg.parts
      .filter((p): p is { type: "text"; text: string } => p.type === "text")
      .map((p) => p.text)
      .join("");
  }
  return typeof msg.content === "string" ? msg.content : "";
}

/** Core message format accepted by generateText / streamText */
interface CoreMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

/**
 * Normalize messages to CoreMessage[] for generateText / streamText.
 * Handles both UIMessage format and simple {role, content} format.
 */
function normalizeMessages(messages: ChatMessageInput[]): CoreMessage[] {
  return messages.map((m) => ({
    role: m.role,
    content: extractMessageText(m),
  }));
}

export async function POST(req: Request) {
  const {
    messages,
    knowledgeBaseId,
    conversationId,
    systemPrompt: providedSystemPrompt,
    mode,
    agentMode,
    vectorTopK,
    keywordTopK,
    finalTopK,
    rerankerTopK,
    fusionTopK,
    queryRewriteMode,
    searchMode = "hybrid",
  }: {
    messages: ChatMessageInput[];
    knowledgeBaseId?: number;
    conversationId?: string;
    systemPrompt?: string;
    mode?: "stream" | "eval";
    /** When true (and a KB is selected), run the agent loop instead of the fixed pipeline. */
    agentMode?: boolean;
    vectorTopK?: number;
    keywordTopK?: number;
    finalTopK?: number;
    rerankerTopK?: number;
    fusionTopK?: number;
    queryRewriteMode?: RewriteMode;
    searchMode?: RetrievalMode;
  } = await req.json();

  const userId = await requireUserId();
  if (!userId) return unauthorized();

  // 若带 conversationId,校验归属当前用户,防止越权向他人对话写消息。
  if (conversationId) {
    const owned = await prisma.conversation.findFirst({
      where: { id: conversationId, user_id: userId },
      select: { id: true },
    });
    if (!owned) {
      return Response.json({ error: "对话不存在或无权访问" }, { status: 404 });
    }
  }

  // 若带 knowledgeBaseId,校验归属当前用户。
  if (knowledgeBaseId) {
    const ownedKb = await prisma.knowledge_base.findFirst({
      where: { id: knowledgeBaseId, user_id: userId },
      select: { id: true },
    });
    if (!ownedKb) {
      return Response.json({ error: "知识库不存在或无权访问" }, { status: 404 });
    }
  }

  // Priority: providedSystemPrompt > build from knowledgeBaseId.
  const lastUserMessage = [...messages].reverse().find((m) => m.role === "user");
  const query = lastUserMessage ? extractMessageText(lastUserMessage) : "";

  const retrievalOptions = {
    vectorTopK: vectorTopK ?? DEFAULT_VECTOR_TOP_K,
    keywordTopK: keywordTopK ?? DEFAULT_KEYWORD_TOP_K,
    finalTopK: finalTopK ?? DEFAULT_FINAL_TOP_K,
    rerankerTopK,
    fusionTopK,
    queryRewriteMode,
  };

  // Build the 1-indexed citation list from retrieval rows — indices match the
  // [N] markers injected by buildRagSystemPrompt.
  const toReferences = (
    results: Awaited<ReturnType<typeof searchKnowledgeBase>>
  ): MessageReference[] =>
    results.map((r, i) => ({
      index: i + 1,
      chunkId: r.chunk_id,
      fileId: r.file_id,
      filename: r.filename,
      chunkText: r.chunk_text,
      snippet: buildSnippet(r.chunk_text),
      source: r.source,
      fusionScore: roundScore(r.score),
      ...(r.rerank_score != null ? { rerankScore: roundScore(r.rerank_score) } : {}),
    }));

  // --- Eval mode: non-streaming JSON response (retrieval runs synchronously) ---
  if (mode === "eval") {
    let systemPrompt: string | undefined = providedSystemPrompt;
    let retrievedContexts: string[] = [];
    const traceSteps: TraceStep[] = [];
    const onTrace: TraceCallback = (step) => traceSteps.push(step);

    if (knowledgeBaseId && query) {
      const searchResults = await searchKnowledgeBase(
        query,
        knowledgeBaseId,
        searchMode,
        retrievalOptions,
        onTrace
      );
      retrievedContexts = searchResults.map((r) => r.chunk_text);
      if (!systemPrompt && searchResults.length > 0) {
        systemPrompt = buildRagSystemPrompt(retrievedContexts);
      }
    }

    const result = await generateText({
      model: chatModel,
      system: systemPrompt,
      messages: normalizeMessages(messages),
    });

    return Response.json({
      answer: result.text,
      systemPrompt: systemPrompt ?? null,
      contexts: retrievedContexts,
      trace: traceSteps.length > 0 ? traceSteps : undefined,
    });
  }

  // --- Stream mode (default) ---

  // Save the latest user message before streaming begins.
  if (conversationId && lastUserMessage) {
    const text = extractMessageText(lastUserMessage);
    if (text) {
      await prisma.conversation_message.create({
        data: { conversation_id: conversationId, role: "user", content: text },
      });
    }
  }

  // The thinking chain is streamed live: a `data-plan` opener, then one
  // `data-trace` per completed retrieval step, a `data-citations` payload, a
  // `data-ready` marker, and finally the merged answer (model reasoning + text).
  const stream = createUIMessageStream<ChatUIMessage>({
    execute: async ({ writer }) => {
      // --- Agent mode: model-driven retrieval loop (tools + stopWhen) ---
      // Retrieval is no longer a fixed pre-generation step — the model calls
      // `retrieveKnowledge` on demand and decides when it has enough. The
      // pipeline branch below is untouched and still handles pipeline mode.
      if (agentMode && knowledgeBaseId && query) {
        const references: MessageReference[] = [];
        const agentTrace: AgentTraceStep[] = [];

        writer.write({
          type: "data-plan",
          data: {
            mode: searchMode,
            intro:
              "Agent 模式:模型将自主决定检索策略与轮次,按需调用工具直到信息充分。",
            agent: true,
          },
        });

        // Fetch the KB name/description so the system prompt can tell the model
        // WHAT is loaded. Without this the agent has no signal a KB exists and
        // treats references like "这本小说" as ambiguous.
        const kb = await prisma.knowledge_base.findUnique({
          where: { id: knowledgeBaseId },
          select: { name: true, description: true },
        });

        const retrieveKnowledge = createRetrieveTool({
          kbId: knowledgeBaseId,
          citations: references,
          buildRefs: toReferences,
          onCitations: (refs) =>
            writer.write({ type: "data-citations", data: [...refs] }),
          onToolCall: (step) => agentTrace.push(step),
        });

        // Same array references — populated during the loop, read at onFinish.
        const agentMetadata: AssistantMessageMetadata = { references, agentTrace };

        const result = streamText({
          model: chatModel,
          system: buildAgentSystemPrompt(kb?.name, kb?.description),
          messages: normalizeMessages(messages),
          tools: { retrieveKnowledge },
          stopWhen: stepCountIs(AGENT_MAX_STEPS),
          onFinish: async ({ response }) => {
            if (!conversationId) return;
            // In a multi-step loop, intermediate assistant messages hold tool
            // calls (no text); the final answer is the text across all of them.
            const text = response.messages
              .filter((m) => m.role === "assistant")
              .flatMap((m) =>
                typeof m.content === "string"
                  ? [m.content]
                  : Array.isArray(m.content)
                    ? m.content
                        .filter(
                          (p): p is { type: "text"; text: string } =>
                            p.type === "text"
                        )
                        .map((p) => p.text)
                    : []
              )
              .join("");
            if (text) {
              await prisma.conversation_message.create({
                data: {
                  conversation_id: conversationId,
                  role: "assistant",
                  content: text,
                  metadata: agentMetadata as unknown as object,
                },
              });
            }
            await prisma.conversation.update({
              where: { id: conversationId },
              data: { updated_at: new Date() },
            });
          },
        });

        writer.merge(result.toUIMessageStream({ sendStart: false, sendFinish: false }));
        return;
      }

      let systemPrompt: string | undefined = providedSystemPrompt;
      let references: MessageReference[] = [];
      const traceSteps: TraceStep[] = [];

      const willRetrieve = !systemPrompt && !!knowledgeBaseId && !!query;
      if (willRetrieve) {
        writer.write({
          type: "data-plan",
          data: { mode: searchMode, intro: buildIntro(searchMode) },
        });

        // Push each step to the client the moment it completes (live timeline)
        // while still collecting them for persistence.
        const onTrace: TraceCallback = (step) => {
          traceSteps.push(step);
          writer.write({ type: "data-trace", id: step.id, data: step });
        };

        const searchResults = await searchKnowledgeBase(
          query,
          knowledgeBaseId!,
          searchMode,
          retrievalOptions,
          onTrace
        );
        const retrievedContexts = searchResults.map((r) => r.chunk_text);
        if (searchResults.length > 0) {
          systemPrompt = buildRagSystemPrompt(retrievedContexts);
        }
        references = toReferences(searchResults);

        if (references.length > 0) {
          writer.write({ type: "data-citations", data: references });
        }
        writer.write({
          type: "data-ready",
          data: { contextCount: retrievedContexts.length },
        });
      }

      const hasTrace = traceSteps.length > 0;
      const assistantMetadata: AssistantMessageMetadata | undefined =
        references.length > 0 || hasTrace
          ? {
              ...(references.length > 0 ? { references } : {}),
              ...(hasTrace ? { trace: traceSteps } : {}),
            }
          : undefined;

      const result = streamText({
        model: chatModel,
        system: systemPrompt,
        messages: normalizeMessages(messages),
        onFinish: async ({ response }) => {
          if (!conversationId) return;
          const assistantMsg = response.messages.find(
            (m) => m.role === "assistant"
          );
          if (assistantMsg) {
            const text =
              typeof assistantMsg.content === "string"
                ? assistantMsg.content
                : assistantMsg.content
                    .filter(
                      (p): p is { type: "text"; text: string } =>
                        p.type === "text"
                    )
                    .map((p) => p.text)
                    .join("");
            if (text) {
              await prisma.conversation_message.create({
                data: {
                  conversation_id: conversationId,
                  role: "assistant",
                  content: text,
                  // Persist references + trace so the thinking chain and
                  // citation UI rehydrate on refresh (data-* parts are
                  // session-transient and don't survive a reload).
                  metadata: assistantMetadata
                    ? (assistantMetadata as unknown as object)
                    : undefined,
                },
              });
            }
          }
          await prisma.conversation.update({
            where: { id: conversationId },
            data: { updated_at: new Date() },
          });
        },
      });

      // createUIMessageStream already opened the assistant message (carrying the
      // data-* parts above); suppress streamText's own start/finish so its
      // reasoning + text attach to that same message instead of spawning a
      // second one.
      writer.merge(result.toUIMessageStream({ sendStart: false, sendFinish: false }));
    },
  });

  return createUIMessageStreamResponse({ stream });
}
