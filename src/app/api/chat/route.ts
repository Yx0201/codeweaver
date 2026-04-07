import { streamText, convertToModelMessages, UIMessage } from "ai";
import model from "@/register/model";
import { vectorSearch } from "@/lib/vector-search";

export const maxDuration = 60;

export async function POST(req: Request) {
  const {
    messages,
    knowledgeBaseId,
  }: { messages: UIMessage[]; knowledgeBaseId?: number } = await req.json();

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
  });

  return result.toUIMessageStreamResponse();
}
