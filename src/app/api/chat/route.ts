import { streamText, generateText } from "ai";
import { chatModel } from "@/register/model";
import { buildRagSystemPrompt } from "@/lib/rag-service";
import { prisma } from "@/lib/prisma";
import { DEFAULT_VECTOR_TOP_K, DEFAULT_KEYWORD_TOP_K, DEFAULT_FINAL_TOP_K } from "@/lib/config";
import type { RewriteMode } from "@/lib/query-rewriter";
import { searchKnowledgeBase, type RetrievalMode } from "@/lib/search-service";
import {
  buildSnippet,
  type AssistantMessageMetadata,
  type MessageReference,
} from "@/lib/citations";
import type { HybridSearchResult } from "@/lib/hybrid-search";

export const maxDuration = 60;

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

  // --- Resolve system prompt ---
  // Priority: providedSystemPrompt > build from knowledgeBaseId
  let systemPrompt: string | undefined = providedSystemPrompt;
  let retrievedContexts: string[] = [];
  // Full retrieval rows are kept (not just chunk_text) so we can build the
  // per-message reference list that streams to the client and persists.
  let searchResults: HybridSearchResult[] = [];

  if (!systemPrompt && knowledgeBaseId) {
    const lastUserMessage = [...messages]
      .reverse()
      .find((m) => m.role === "user");
    const query = lastUserMessage ? extractMessageText(lastUserMessage) : "";

    if (query) {
      searchResults = await searchKnowledgeBase(
        query,
        knowledgeBaseId,
        searchMode,
        {
          vectorTopK: vectorTopK ?? DEFAULT_VECTOR_TOP_K,
          keywordTopK: keywordTopK ?? DEFAULT_KEYWORD_TOP_K,
          finalTopK: finalTopK ?? DEFAULT_FINAL_TOP_K,
          rerankerTopK,
          fusionTopK,
          queryRewriteMode,
        }
      );
      retrievedContexts = searchResults.map((r) => r.chunk_text);
      if (searchResults.length > 0) {
        systemPrompt = buildRagSystemPrompt(retrievedContexts);
      }
    }
  } else if (systemPrompt && knowledgeBaseId && mode === "eval") {
    const lastUserMessage = [...messages]
      .reverse()
      .find((m) => m.role === "user");
    const query = lastUserMessage ? extractMessageText(lastUserMessage) : "";

    if (query) {
      searchResults = await searchKnowledgeBase(
        query,
        knowledgeBaseId,
        searchMode,
        {
          vectorTopK: vectorTopK ?? DEFAULT_VECTOR_TOP_K,
          keywordTopK: keywordTopK ?? DEFAULT_KEYWORD_TOP_K,
          finalTopK: finalTopK ?? DEFAULT_FINAL_TOP_K,
          rerankerTopK,
          fusionTopK,
          queryRewriteMode,
        }
      );
      retrievedContexts = searchResults.map((r) => r.chunk_text);
    }
  }

  // Build the citation reference list — 1-indexed to match the [N] markers
  // injected by buildRagSystemPrompt. This is the same array sent inline via
  // the AI SDK's message metadata AND persisted to conversation_message.metadata.
  const references: MessageReference[] = searchResults.map((r, i) => ({
    index: i + 1,
    chunkId: r.chunk_id,
    fileId: r.file_id,
    filename: r.filename,
    chunkText: r.chunk_text,
    snippet: buildSnippet(r.chunk_text),
    source: r.source,
  }));

  // --- Eval mode: non-streaming JSON response ---
  if (mode === "eval") {
    const result = await generateText({
      model: chatModel,
      system: systemPrompt,
      messages: normalizeMessages(messages),
    });

    return Response.json({
      answer: result.text,
      systemPrompt: systemPrompt ?? null,
      contexts: retrievedContexts,
    });
  }

  // --- Stream mode (default): save user message, stream response ---

  // Save the latest user message
  if (conversationId) {
    const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
    if (lastUserMsg) {
      const text = extractMessageText(lastUserMsg);
      if (text) {
        await prisma.conversation_message.create({
          data: {
            conversation_id: conversationId,
            role: "user",
            content: text,
          },
        });
      }
    }
  }

  const assistantMetadata: AssistantMessageMetadata | undefined =
    references.length > 0 ? { references } : undefined;

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
                  (p): p is { type: "text"; text: string } => p.type === "text"
                )
                .map((p) => p.text)
                .join("");
        if (text) {
          await prisma.conversation_message.create({
            data: {
              conversation_id: conversationId,
              role: "assistant",
              content: text,
              // Persist references so the citation UI rehydrates on refresh.
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

  // Attach the reference list to the assistant message at stream start —
  // useChat exposes it via `message.metadata`, so the citation UI renders the
  // moment the answer begins streaming, not after onFinish.
  return result.toUIMessageStreamResponse({
    messageMetadata: ({ part }) =>
      part.type === "start" && assistantMetadata ? assistantMetadata : undefined,
  });
}
