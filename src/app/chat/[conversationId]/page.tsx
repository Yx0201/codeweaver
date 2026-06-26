import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { ChatShell } from "../_components/chat-shell";
import type { SearchMode } from "@/actions/conversation";
import { readAssistantMetadata } from "@/lib/citations";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ conversationId: string }>;
}

export default async function ConversationPage({ params }: PageProps) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;

  const { conversationId } = await params;

  const [conversation, messages, conversations, knowledgeBases] =
    await Promise.all([
      // findUnique 不支持跨表 user_id 过滤,改 findFirst 校验归属;
      // 不属于当前用户的对话当作不存在,跳回 /chat。
      prisma.conversation.findFirst({
        where: { id: conversationId, user_id: userId },
      }),
      prisma.conversation_message.findMany({
        where: { conversation_id: conversationId },
        orderBy: { created_at: "asc" },
      }),
      prisma.conversation.findMany({
        where: { user_id: userId },
        orderBy: { updated_at: "desc" },
        select: { id: true, title: true, created_at: true, updated_at: true },
      }),
      prisma.knowledge_base.findMany({
        where: { user_id: userId },
        orderBy: { created_at: "desc" },
        select: { id: true, name: true, description: true },
      }),
    ]);

  if (!conversation) redirect("/chat");

  const initialMessages = messages.map((msg) => {
    // For assistant rows we re-attach the references the chat route stored
    // at `metadata` time so the citation list rehydrates after refresh.
    const metadata =
      msg.role === "assistant" ? readAssistantMetadata(msg.metadata) : undefined;
    return {
      id: msg.id,
      role: msg.role as "user" | "assistant",
      content: msg.content,
      parts: [{ type: "text" as const, text: msg.content }],
      ...(metadata ? { metadata } : {}),
    };
  });

  return (
    <ChatShell
      key={conversationId}
      initialConversations={conversations.map((c) => ({
        id: c.id,
        title: c.title,
        created_at: c.created_at?.toISOString() ?? "",
        updated_at: c.updated_at?.toISOString() ?? "",
      }))}
      initialConversationId={conversationId}
      initialMessages={initialMessages}
      initialKbId={conversation.knowledge_base_id}
      initialSearchMode={(conversation.search_mode as SearchMode) ?? "hybrid"}
      knowledgeBases={knowledgeBases}
    />
  );
}
