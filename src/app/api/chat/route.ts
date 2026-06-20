import {
  streamText,
  generateText,
  createUIMessageStream,
  createUIMessageStreamResponse,
} from "ai";
import { chatModel } from "@/register/model";
import { buildRagSystemPrompt } from "@/lib/rag-service";
import { prisma } from "@/lib/prisma";
import { DEFAULT_VECTOR_TOP_K, DEFAULT_KEYWORD_TOP_K, DEFAULT_FINAL_TOP_K } from "@/lib/config";
import type { RewriteMode } from "@/lib/query-rewriter";
import { searchKnowledgeBase } from "@/lib/search-service";
import {
  buildSnippet,
  type AssistantMessageMetadata,
  type MessageReference,
} from "@/lib/citations";
import type { TraceCallback, TraceStep } from "@/lib/trace";
import { buildIntro, type ChatUIMessage } from "@/lib/chat-stream";
import type { RetrievalMode } from "@/lib/search-service";

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
    vectorTopK?: number;
    keywordTopK?: number;
    finalTopK?: number;
    rerankerTopK?: number;
    fusionTopK?: number;
    queryRewriteMode?: RewriteMode;
    searchMode?: RetrievalMode;
  } = await req.json();

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
