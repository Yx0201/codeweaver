import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ChatShell } from "../_components/chat-shell";
import type { SearchMode } from "@/actions/conversation";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ conversationId: string }>;
}

export default async function ConversationPage({ params }: PageProps) {
  const { conversationId } = await params;

  const [conversation, messages, conversations, knowledgeBases] =
    await Promise.all([
      prisma.conversation.findUnique({ where: { id: conversationId } }),
      prisma.conversation_message.findMany({
        where: { conversation_id: conversationId },
        orderBy: { created_at: "asc" },
      }),
      prisma.conversation.findMany({
        orderBy: { updated_at: "desc" },
        select: { id: true, title: true, created_at: true, updated_at: true },
      }),
      prisma.knowledge_base.findMany({
        orderBy: { created_at: "desc" },
        select: { id: true, name: true, description: true },
      }),
    ]);

  if (!conversation) redirect("/chat");

  const initialMessages = messages.map((msg) => ({
    id: msg.id,
    role: msg.role as "user" | "assistant",
    content: msg.content,
    parts: [{ type: "text" as const, text: msg.content }],
  }));

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
