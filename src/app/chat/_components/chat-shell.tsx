"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ConversationSidebar } from "./conversation-sidebar";
import { ChatInterface } from "./chat-interface";
import type { SearchMode } from "@/actions/conversation";

export interface ConversationItem {
  id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
}

interface KnowledgeBase {
  id: number;
  name: string;
  description: string | null;
}

interface InitialMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  parts: { type: "text"; text: string }[];
}

interface ChatShellProps {
  initialConversations: ConversationItem[];
  initialConversationId?: string;
  initialMessages?: InitialMessage[];
  initialKbId?: number | null;
  initialSearchMode?: SearchMode;
  knowledgeBases: KnowledgeBase[];
}

export function ChatShell({
  initialConversations,
  initialConversationId,
  initialMessages,
  initialKbId,
  initialSearchMode,
  knowledgeBases,
}: ChatShellProps) {
  const router = useRouter();
  const [conversations, setConversations] = useState(initialConversations);
  const [currentConversationId, setCurrentConversationId] = useState(
    initialConversationId
  );
  // Set of conversation IDs whose title is being generated
  const [pendingTitles, setPendingTitles] = useState<Set<string>>(new Set());
  const [chatKey, setChatKey] = useState(0);

  const handleConversationCreated = async (
    id: string,
    firstMessage: string
  ) => {
    // Update URL without navigation (preserves useChat state / streaming)
    window.history.replaceState(null, "", `/chat/${id}`);
    setCurrentConversationId(id);

    // Prepend the new conversation to the list
    setConversations((prev) => [
      {
        id,
        title: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      ...prev,
    ]);

    // Generate title concurrently
    setPendingTitles((prev) => new Set(prev).add(id));
    try {
      const res = await fetch(`/api/conversations/${id}/title`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userMessage: firstMessage }),
      });
      const { title } = await res.json();
      setConversations((prev) =>
        prev.map((c) => (c.id === id ? { ...c, title } : c))
      );
    } finally {
      setPendingTitles((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const handleSelect = (id: string) => {
    router.push(`/chat/${id}`);
  };

  const handleNew = () => {
    setCurrentConversationId(undefined);
    setChatKey((k) => k + 1);
    router.push("/chat");
  };

  const handleTitleUpdate = (id: string, title: string) => {
    setConversations((prev) =>
      prev.map((c) => (c.id === id ? { ...c, title } : c))
    );
  };

  const handleDelete = (id: string) => {
    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (currentConversationId === id) {
      router.replace("/chat");
    }
  };

  return (
    <div className="flex h-full overflow-hidden">
      <ConversationSidebar
        conversations={conversations}
        currentConversationId={currentConversationId}
        pendingTitles={pendingTitles}
        onSelect={handleSelect}
        onNew={handleNew}
        onTitleUpdate={handleTitleUpdate}
        onDelete={handleDelete}
      />
      <div className="flex-1 min-w-0 border-l">
        <ChatInterface
          key={chatKey}
          conversationId={currentConversationId}
          initialMessages={
            currentConversationId === initialConversationId
              ? initialMessages
              : undefined
          }
          initialKbId={
            currentConversationId === initialConversationId
              ? initialKbId
              : undefined
          }
          initialSearchMode={
            currentConversationId === initialConversationId
              ? initialSearchMode
              : undefined
          }
          knowledgeBases={knowledgeBases}
          onConversationCreated={handleConversationCreated}
        />
      </div>
    </div>
  );
}
