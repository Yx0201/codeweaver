import { prisma } from "@/lib/prisma";
import { ChatShell } from "./_components/chat-shell";

export const dynamic = "force-dynamic";

export default async function ChatPage() {
  const [conversations, knowledgeBases] = await Promise.all([
    prisma.conversation.findMany({
      orderBy: { updated_at: "desc" },
      select: { id: true, title: true, created_at: true, updated_at: true },
    }),
    prisma.knowledge_base.findMany({
      orderBy: { created_at: "desc" },
      select: { id: true, name: true, description: true },
    }),
  ]);

  return (
    <ChatShell
      key="new-conversation"
      initialConversations={conversations.map((c) => ({
        id: c.id,
        title: c.title,
        created_at: c.created_at?.toISOString() ?? "",
        updated_at: c.updated_at?.toISOString() ?? "",
      }))}
      knowledgeBases={knowledgeBases}
    />
  );
}
