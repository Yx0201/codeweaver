import { streamText, generateText } from "ai";
import model from "@/register/model";
import { vectorSearch } from "@/lib/vector-search";
import { buildRagSystemPrompt } from "@/lib/rag-service";
import { prisma } from "@/lib/prisma";

export const maxDuration = 60;

/**
 * Extract text from a message, supporting both UIMessage format (with parts)
 * and simple {role, content} format (from the Python eval script).
 */
function extractMessageText(msg: { parts?: { type: string; text?: string }[]; content?: string }): string {
  if (msg.parts) {
    return msg.parts
      .filter((p): p is { type: "text"; text: string } => p.type === "text")
      .map((p) => p.text)
      .join("");
  }
  return typeof msg.content === "string" ? msg.content : "";
}

/**
 * Normalize messages to CoreMessage[] for generateText / streamText.
 * Handles both UIMessage format and simple {role, content} format.
 */
function normalizeMessages(messages: any[]) {
  return messages.map((m) => ({
    role: m.role as "user" | "assistant" | "system",
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
  }: {
    messages: any[];
    knowledgeBaseId?: number;
    conversationId?: string;
    systemPrompt?: string;
    mode?: "stream" | "eval";
  } = await req.json();

  // --- Resolve system prompt ---
  // Priority: providedSystemPrompt > build from knowledgeBaseId
  let systemPrompt: string | undefined = providedSystemPrompt;
  let retrievedContexts: string[] = [];

  if (!systemPrompt && knowledgeBaseId) {
    const lastUserMessage = [...messages]
      .reverse()
      .find((m) => m.role === "user");
    const query = lastUserMessage ? extractMessageText(lastUserMessage) : "";

    if (query) {
      const results = await vectorSearch(query, knowledgeBaseId, 5);
      retrievedContexts = results.map((r) => r.chunk_text);
      if (results.length > 0) {
        systemPrompt = buildRagSystemPrompt(retrievedContexts);
      }
    }
  } else if (systemPrompt && knowledgeBaseId && mode === "eval") {
    // When systemPrompt is provided directly, retrieve contexts for the eval response
    const lastUserMessage = [...messages]
      .reverse()
      .find((m) => m.role === "user");
    const query = lastUserMessage ? extractMessageText(lastUserMessage) : "";

    if (query) {
      const results = await vectorSearch(query, knowledgeBaseId, 5);
      retrievedContexts = results.map((r) => r.chunk_text);
    }
  }

  // --- Eval mode: non-streaming JSON response ---
  if (mode === "eval") {
    const result = await generateText({
      model,
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

  const result = streamText({
    model,
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

  return result.toUIMessageStreamResponse();
}
