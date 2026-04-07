import { streamText, convertToModelMessages, UIMessage } from "ai";
import model from "@/register/model";
import { vectorSearch } from "@/lib/vector-search";
import { prisma } from "@/lib/prisma";

export const maxDuration = 60;

export async function POST(req: Request) {
  const {
    messages,
    knowledgeBaseId,
    conversationId,
  }: {
    messages: UIMessage[];
    knowledgeBaseId?: number;
    conversationId?: string;
  } = await req.json();

  // Save the latest user message
  if (conversationId) {
    const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
    if (lastUserMsg) {
      const text = lastUserMsg.parts
        ?.filter((p): p is { type: "text"; text: string } => p.type === "text")
        .map((p) => p.text)
        .join("") ?? "";
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

  let systemPrompt: string | undefined;

  if (knowledgeBaseId) {
    const lastUserMessage = [...messages]
      .reverse()
      .find((m) => m.role === "user");
    const query =
      lastUserMessage?.parts
        ?.filter((p): p is { type: "text"; text: string } => p.type === "text")
        .map((p) => p.text)
        .join(" ") ?? "";

    if (query) {
      const results = await vectorSearch(query, knowledgeBaseId, 5);
      if (results.length > 0) {
        const context = results
          .map((r, i) => `[${i + 1}] ${r.chunk_text}`)
          .join("\n\n");
        systemPrompt = `你是一个知识库问答助手。请根据以下参考资料回答用户的问题。如果参考资料中没有相关信息，请如实告知。\n\n参考资料：\n${context}`;
      }
    }
  }

  const result = streamText({
    model,
    system: systemPrompt,
    messages: await convertToModelMessages(messages),
    onFinish: async ({ response }) => {
      if (!conversationId) return;
      const assistantMsg = response.messages.find((m) => m.role === "assistant");
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
