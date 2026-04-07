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
import { RefreshCcwIcon, CopyIcon, BookOpen } from "lucide-react";
import { useChat } from "@ai-sdk/react";
import { Fragment } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createConversation } from "@/actions/conversation";

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
  knowledgeBases: KnowledgeBase[];
  onConversationCreated: (id: string, firstMessage: string) => void;
}

export function ChatInterface({
  conversationId,
  initialMessages,
  knowledgeBases,
  onConversationCreated,
}: ChatInterfaceProps) {
  const [input, setInput] = useState("");
  const [selectedKbId, setSelectedKbId] = useState<string>("");
  // ref to track the current conversationId without causing re-renders
  const conversationIdRef = useRef(conversationId);
  useEffect(() => {
    conversationIdRef.current = conversationId;
  }, [conversationId]);

  const kbId =
    selectedKbId && selectedKbId !== "none"
      ? parseInt(selectedKbId)
      : undefined;

  const { messages, sendMessage, status, regenerate } = useChat({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    messages: initialMessages as any,
  });

  const handleSubmit = async (message: PromptInputMessage) => {
    if (!message.text.trim()) return;

    let convId = conversationIdRef.current;

    // First message in a new conversation: create the conversation record first
    if (!convId) {
      const conv = await createConversation();
      convId = conv.id;
      conversationIdRef.current = convId;
      // Notify parent: updates URL + starts title generation (non-blocking)
      onConversationCreated(convId, message.text);
    }

    sendMessage(
      { text: message.text },
      {
        body: {
          conversationId: convId,
          ...(kbId ? { knowledgeBaseId: kbId } : {}),
        },
      }
    );
    setInput("");
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
                                onClick={() => regenerate()}
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
            <BookOpen className="size-4 text-muted-foreground" />
            <Select value={selectedKbId} onValueChange={setSelectedKbId}>
              <SelectTrigger>
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
