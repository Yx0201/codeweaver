"use client";

import { useState, Fragment } from "react";
import { useChat } from "@ai-sdk/react";
import { Sparkles, Zap, Shield, Code } from "lucide-react";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import {
  Message,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import {
  PromptInput,
  type PromptInputMessage,
  PromptInputTextarea,
  PromptInputSubmit,
} from "@/components/ai-elements/prompt-input";
import { Button } from "@/components/ui/button";

const QUICK_QUESTIONS = [
  "CodeWeaver 有哪些核心功能？",
  "如何使用知识库问答？",
  "如何上传文档到知识库？",
  "支持哪些 AI 模型？",
];

export default function HomePage() {
  const [input, setInput] = useState("");
  const { messages, sendMessage, status, stop } = useChat();

  const handleSubmit = (message: PromptInputMessage) => {
    if (!message.text.trim()) return;
    sendMessage({ text: message.text });
    setInput("");
  };

  const handleQuickQuestion = (q: string) => {
    sendMessage({ text: q });
  };

  return (
    <div className="flex flex-col h-full relative overflow-hidden">
      {/* 背景装饰层 */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.04]">
        <Sparkles className="absolute top-8 left-8 size-16" />
        <Zap className="absolute top-8 right-8 size-16" />
        <Shield className="absolute bottom-24 left-8 size-16" />
        <Code className="absolute bottom-24 right-8 size-16" />
      </div>

      {/* 对话区域 */}
      <Conversation className="min-h-0">
        <ConversationContent>
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-6 py-12">
              <div className="flex flex-col items-center gap-3">
                <div className="p-4 bg-primary/10 rounded-2xl">
                  <Sparkles className="size-10 text-primary" />
                </div>
                <h1 className="text-2xl font-semibold tracking-tight">
                  你好，我是 CodeWeaver AI
                </h1>
                <p className="text-sm text-muted-foreground text-center max-w-xs">
                  基于本地 Ollama，保护隐私，直接开始对话
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2">
                {QUICK_QUESTIONS.map((q) => (
                  <Button
                    key={q}
                    variant="outline"
                    size="sm"
                    className="rounded-full"
                    onClick={() => handleQuickQuestion(q)}
                  >
                    {q}
                  </Button>
                ))}
              </div>
            </div>
          ) : (
            <>
              {messages.map((message) => (
                <Fragment key={message.id}>
                  {message.parts.map((part, i) => {
                    switch (part.type) {
                      case "text": {
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
            </>
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      {/* 输入框区域 */}
      <div className="shrink-0 px-4 pb-4">
        <div className="max-w-2xl mx-auto">
          <PromptInput onSubmit={handleSubmit} className="w-full relative">
            <PromptInputTextarea
              value={input}
              placeholder="向 CodeWeaver 提问..."
              onChange={(e) => setInput(e.currentTarget.value)}
              className="pr-12"
            />
            <PromptInputSubmit
              status={status}
              onStop={stop}
              disabled={!input.trim() && status === "ready"}
              className="absolute bottom-1 right-1"
            />
          </PromptInput>
        </div>
      </div>
    </div>
  );
}
