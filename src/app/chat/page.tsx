import { prisma } from "@/lib/prisma";
import { ChatInterface } from "./_components/chat-interface";

export default async function ChatPage() {
  const knowledgeBases = await prisma.knowledge_base.findMany({
    orderBy: { created_at: "desc" },
    select: { id: true, name: true, description: true },
  });

  return <ChatInterface knowledgeBases={knowledgeBases} />;
}
