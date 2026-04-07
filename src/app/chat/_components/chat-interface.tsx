"use client";

import { useState } from "react";
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

interface KnowledgeBase {
  id: number;
  name: string;
  description: string | null;
}

interface ChatInterfaceProps {
  knowledgeBases: KnowledgeBase[];
}

export function ChatInterface({ knowledgeBases }: ChatInterfaceProps) {
  const [input, setInput] = useState("");
  const [selectedKbId, setSelectedKbId] = useState<string>("");

  const kbId =
    selectedKbId && selectedKbId !== "none"
      ? parseInt(selectedKbId)
      : undefined;

  const { messages, sendMessage, status, regenerate } = useChat();

  const handleSubmit = (message: PromptInputMessage) => {
    if (message.text.trim()) {
      sendMessage(
        { text: message.text },
        kbId ? { body: { knowledgeBaseId: kbId } } : undefined
      );
      setInput("");
    }
  };

  return (
    <div className="w-full mx-auto p-6 relative h-full">
      <div className="flex flex-col h-full">
        <Conversation>
          <ConversationContent>
            {messages.map((message, messageIndex) => (
              <Fragment key={message.id}>
                {message.parts.map((part, i) => {
                  switch (part.type) {
                    case "text":
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

        <div className="mt-4 w-full max-w-2xl mx-auto flex flex-col gap-2">
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
