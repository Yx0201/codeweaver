"use client";

import { useEffect, useRef, useState } from "react";
import {
  MessageActions,
  MessageAction,
} from "@/components/ai-elements/message";
import { Message, MessageContent } from "@/components/ai-elements/message";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import {
  PromptInput,
  type PromptInputMessage,
  PromptInputTextarea,
  PromptInputSubmit,
} from "@/components/ai-elements/prompt-input";
import { MessageResponse } from "@/components/ai-elements/message";
import { RefreshCcwIcon, CopyIcon, BookOpen, Search } from "lucide-react";
import { useChat } from "@ai-sdk/react";
import { Fragment } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createConversation, type SearchMode } from "@/actions/conversation";

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

interface ChatInterfaceProps {
  conversationId?: string;
  initialMessages?: InitialMessage[];
  initialKbId?: number | null;
  initialSearchMode?: SearchMode;
  knowledgeBases: KnowledgeBase[];
  onConversationCreated: (id: string, firstMessage: string) => void;
}

const SEARCH_MODES: { value: SearchMode; label: string }[] = [
  { value: "hybrid", label: "混合检索" },
  { value: "graph", label: "图谱检索" },
  { value: "fast", label: "快速检索" },
];

export function ChatInterface({
  conversationId,
  initialMessages,
  initialKbId,
  initialSearchMode,
  knowledgeBases,
  onConversationCreated,
}: ChatInterfaceProps) {
  const [input, setInput] = useState("");
  const [selectedKbId, setSelectedKbId] = useState<string>(
    initialKbId != null ? String(initialKbId) : ""
  );
  const [searchMode, setSearchMode] = useState<SearchMode>(
    initialSearchMode ?? "hybrid"
  );
  // ref to track the current conversationId without causing re-renders
  const conversationIdRef = useRef(conversationId);
  useEffect(() => {
    conversationIdRef.current = conversationId;
  }, [conversationId]);

  // Store the last system prompt for regenerate
  const lastSystemPromptRef = useRef<string | undefined>(undefined);

  const kbId =
    selectedKbId && selectedKbId !== "none"
      ? parseInt(selectedKbId)
      : undefined;

  const persistSettings = (updates: { knowledgeBaseId?: number | null; searchMode?: SearchMode }) => {
    const convId = conversationIdRef.current;
    if (convId) {
      fetch(`/api/conversations/${convId}/kb`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      }).catch(() => {});
    }
  };

  const handleKbChange = (value: string) => {
    setSelectedKbId(value);
    persistSettings({ knowledgeBaseId: value === "none" ? null : parseInt(value) });
  };

  const handleSearchModeChange = (value: SearchMode) => {
    setSearchMode(value);
    persistSettings({ searchMode: value });
  };

  const { messages, sendMessage, status, regenerate } = useChat({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    messages: initialMessages as any,
  });

  /**
   * Run the RAG pipeline: vector search → system prompt.
   * This is the same sequence the evaluation script uses,
   * ensuring identical behavior for users and tests.
   */
  const fetchRagContext = async (
    query: string,
    knowledgeBaseId: number
  ): Promise<string | undefined> => {
    // Step 1: Hybrid search (vector + keyword + RRF)
    const searchRes = await fetch("/api/vector-search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query,
        knowledgeBaseId,
        vectorTopK: 20,
        keywordTopK: 20,
        finalTopK: 10,
        searchMode,
      }),
    });

    if (!searchRes.ok) return undefined;

    const { results } = await searchRes.json();
    if (!results || results.length === 0) return undefined;

    // Step 2: Build system prompt from retrieved contexts
    const contexts: string[] = results.map(
      (r: { chunk_text: string }) => r.chunk_text
    );

    const promptRes = await fetch("/api/system-prompt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contexts }),
    });

    if (!promptRes.ok) return undefined;

    const { systemPrompt } = await promptRes.json();
    return systemPrompt;
  };

  const handleSubmit = async (message: PromptInputMessage) => {
    if (!message.text.trim()) return;

    let convId = conversationIdRef.current;

    // First message in a new conversation: create the conversation record first
    if (!convId) {
      const conv = await createConversation(kbId, searchMode);
      convId = conv.id;
      conversationIdRef.current = convId;
      // Notify parent: updates URL + starts title generation (non-blocking)
      onConversationCreated(convId, message.text);
    }

    // Pre-fetch RAG context (vector search + system prompt) if KB is selected
    let systemPrompt: string | undefined;
    if (kbId) {
      systemPrompt = await fetchRagContext(message.text, kbId);
      lastSystemPromptRef.current = systemPrompt;
    } else {
      lastSystemPromptRef.current = undefined;
    }

    sendMessage(
      { text: message.text },
      {
        body: {
          conversationId: convId,
          ...(kbId ? { knowledgeBaseId: kbId } : {}),
          ...(systemPrompt ? { systemPrompt } : {}),
          searchMode,
        },
      }
    );
    setInput("");
  };

  const handleRegenerate = () => {
    regenerate({
      body: {
        conversationId: conversationIdRef.current,
        ...(lastSystemPromptRef.current
          ? { systemPrompt: lastSystemPromptRef.current }
          : {}),
        searchMode,
      },
    });
  };

  return (
    <div className="w-full mx-auto p-6 relative h-full">
      <div className="flex flex-col h-full">
        <Conversation className="min-h-0">
          <ConversationContent>
            {messages.map((message, messageIndex) => (
              <Fragment key={message.id}>
                {message.parts.map((part, i) => {
                  switch (part.type) {
                    case "text": {
                      const isLastMessage =
                        messageIndex === messages.length - 1;
                      return (
                        <Fragment key={`${message.id}-${i}`}>
                          <Message from={message.role}>
                            <div
                              className={`w-full flex ${message.role === "user" ? "flex-row-reverse" : ""}`}
                            >
                              <div
                                className={`w-8 h-8 rounded-2xl ${message.role === "user" ? "bg-sky-300" : "bg-green-300"}`}
                              />
                            </div>
                            <MessageContent>
                              <MessageResponse>{part.text}</MessageResponse>
                            </MessageContent>
                          </Message>
                          {message.role === "assistant" && isLastMessage && (
                            <MessageActions>
                              <MessageAction
                                onClick={handleRegenerate}
                                label="Retry"
                              >
                                <RefreshCcwIcon className="size-3" />
                              </MessageAction>
                              <MessageAction
                                onClick={() =>
                                  navigator.clipboard.writeText(part.text)
                                }
                                label="Copy"
                              >
                                <CopyIcon className="size-3" />
                              </MessageAction>
                            </MessageActions>
                          )}
                        </Fragment>
                      );
                    }
                    default:
                      return null;
                  }
                })}
              </Fragment>
            ))}
            {status === "submitted" && (
              <Message from="assistant">
                <div className="w-full flex">
                  <div className="w-8 h-8 rounded-2xl bg-green-300" />
                </div>
                <MessageContent>
                  <div className="flex items-center gap-1 py-1 px-1">
                    <span className="w-2 h-2 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:0ms]" />
                    <span className="w-2 h-2 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:150ms]" />
                    <span className="w-2 h-2 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:300ms]" />
                  </div>
                </MessageContent>
              </Message>
            )}
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>

        <div className="mt-4 w-full max-w-2xl mx-auto flex flex-col gap-2 shrink-0">
          <div className="flex items-center gap-2">
            <BookOpen className="size-4 text-muted-foreground shrink-0" />
            <Select value={selectedKbId} onValueChange={handleKbChange}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="选择知识库（可选）" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">不使用知识库</SelectItem>
                {knowledgeBases.map((kb) => (
                  <SelectItem key={kb.id} value={String(kb.id)}>
                    {kb.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Search className="size-4 text-muted-foreground shrink-0 ml-2" />
            <Select value={searchMode} onValueChange={(v) => handleSearchModeChange(v as SearchMode)}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SEARCH_MODES.map((mode) => (
                  <SelectItem key={mode.value} value={mode.value}>
                    {mode.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <PromptInput onSubmit={handleSubmit} className="w-full relative">
            <PromptInputTextarea
              value={input}
              placeholder="Say something..."
              onChange={(e) => setInput(e.currentTarget.value)}
              className="pr-12"
            />
            <PromptInputSubmit
              status={status === "streaming" ? "streaming" : "ready"}
              disabled={!input.trim()}
              className="absolute bottom-1 right-1"
            />
          </PromptInput>
        </div>
      </div>
    </div>
  );
}
