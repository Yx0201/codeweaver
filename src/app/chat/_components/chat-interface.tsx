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
  ChatScrollController,
} from "@/components/ai-elements/conversation";
import { useChatScroll } from "@/components/settings/chat-scroll-provider";
import {
  PromptInput,
  type PromptInputMessage,
  PromptInputTextarea,
  PromptInputSubmit,
  PromptInputFooter,
  PromptInputTools,
} from "@/components/ai-elements/prompt-input";
import { MessageResponse } from "@/components/ai-elements/message";
import { RefreshCcwIcon, CopyIcon, BookOpen, Bot, User } from "lucide-react";
import { useChat } from "@ai-sdk/react";
import { Fragment } from "react";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { createConversation, type SearchMode } from "@/actions/conversation";
import type {
  AgentTraceStep,
  AssistantMessageMetadata,
  MessageReference,
} from "@/lib/citations";
import type { TraceStep } from "@/lib/trace";
import type { ChatDataParts } from "@/lib/chat-stream";
import { CitationList } from "./citation-list";
import { ThinkingChain } from "./thinking-chain";
import { AgentThinkingChain } from "./agent-thinking-chain";
import {
  CitationAnchor,
  preprocessCitations,
} from "./citation-anchor";

// Streamdown component overrides for assistant messages. Defined at module
// scope so the object identity is stable across renders.
const assistantStreamdownComponents = { a: CitationAnchor };

// The three-dot "thinking" indicator, shared by the standalone pre-stream
// bubble and the in-container waiting-for-answer state.
function LoadingDots() {
  return (
    <div className="flex items-center gap-1 py-1 px-1">
      <span className="w-2 h-2 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:0ms]" />
      <span className="w-2 h-2 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:150ms]" />
      <span className="w-2 h-2 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:300ms]" />
    </div>
  );
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
  metadata?: AssistantMessageMetadata;
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
  // Agent vs pipeline engine — a per-session client preference (default
  // pipeline, the safe, fast path). Sent on every sendMessage/regenerate; not
  // persisted to the DB in this iteration, so a refresh resets to pipeline.
  const [agentMode, setAgentMode] = useState(false);
  // ref to track the current conversationId without causing re-renders
  const conversationIdRef = useRef(conversationId);
  useEffect(() => {
    conversationIdRef.current = conversationId;
  }, [conversationId]);

  const submittingRef = useRef(false);
  const lastSubmittedTextRef = useRef<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Optimistic user bubble shown the instant the user hits send, BEFORE useChat's
  // sendMessage appends the real message. This hides the new-conversation latency
  // (createConversation awaits a remote-Neon insert before sendMessage can fire).
  // It is rendered only while `status === "ready"` (the pre-send window); once
  // sendMessage flips status to "submitted", useChat owns the bubble and the
  // effect below clears this.
  const [optimisticUserText, setOptimisticUserText] = useState<string | null>(
    null
  );

  const kbId =
    selectedKbId && selectedKbId !== "none"
      ? parseInt(selectedKbId)
      : undefined;

  // Compact label for the knowledge-base trigger: the selected base's name,
  // or a muted "知识库" prompt when none is active.
  const selectedKb = knowledgeBases.find(
    (kb) => String(kb.id) === selectedKbId
  );
  const kbActive = !!selectedKb && selectedKbId !== "none";
  const kbLabel = selectedKb ? selectedKb.name : "知识库";

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

  const { messages, sendMessage, status, regenerate, stop } = useChat({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    messages: initialMessages as any,
  });

  // Chat scroll behavior is a cross-conversation preference stored in
  // localStorage (see ChatScrollProvider). force-bottom mode uses the
  // ChatScrollController below to pin the viewport to the newest reply.
  const { scrollMode } = useChatScroll();

  // A value that changes as the streaming assistant reply grows — used by
  // ChatScrollController to re-pin to the bottom on each content tick. We use
  // the text length of the last message (sum of its text parts) so every
  // streamed chunk bumps the signature and triggers a re-scroll.
  const lastMessage = messages[messages.length - 1];
  const lastMessageSignature = lastMessage
    ? lastMessage.parts
        .filter((p) => p.type === "text")
        .reduce(
          (acc, p) => acc + ((p as { text?: string }).text?.length ?? 0),
          0
        )
    : 0;

  useEffect(() => {
    if (status === "ready" || status === "error") {
      lastSubmittedTextRef.current = null;
    }
  }, [status]);

  // useChat appends the real user bubble + flips status to "submitted" the
  // moment sendMessage is called. Once it has taken over, drop our optimistic
  // copy so we never render two bubbles for the same message. (During the
  // pre-send createConversation await, status is still "ready" so this stays
  // put — which is exactly when we need the optimistic bubble visible.)
  useEffect(() => {
    if (
      optimisticUserText &&
      (status === "submitted" || status === "streaming")
    ) {
      setOptimisticUserText(null);
    }
  }, [status, optimisticUserText]);

  const handleSubmit = async (message: PromptInputMessage) => {
    const text = message.text.trim();
    if (!text) return;

    const hasActiveResponse = status === "submitted" || status === "streaming";
    if (
      lastSubmittedTextRef.current === text &&
      (submittingRef.current || hasActiveResponse)
    ) {
      return;
    }

    submittingRef.current = true;
    lastSubmittedTextRef.current = text;
    setIsSubmitting(true);
    setInput("");
    // Show the user bubble + AI-loading immediately — BEFORE the (possibly slow)
    // new-conversation insert. Without this, the message wouldn't render until
    // createConversation resolves and sendMessage finally fires.
    setOptimisticUserText(text);

    if (hasActiveResponse) {
      stop();
    }

    let convId = conversationIdRef.current;

    try {
      // First message in a new conversation: create the record first so the
      // /api/chat call has a conversationId to persist messages against. This
      // is a single DB insert, but on remote Neon it can take hundreds of ms —
      // which is exactly the latency the optimistic bubble above covers.
      if (!convId) {
        const conv = await createConversation(kbId, searchMode);
        convId = conv.id;
        conversationIdRef.current = convId;
        // URL update + title generation — both fire-and-forget, non-blocking.
        onConversationCreated(convId, text);
      }

      // Fire the chat request immediately. useChat optimistically appends the
      // user bubble + flips status to "submitted" (showing the loading dots)
      // the moment sendMessage is called — so the user sees their message and
      // the AI-thinking indicator without any wait.
      //
      // The RAG pipeline (vector search + query rewrite + system prompt) runs
      // entirely inside /api/chat when we pass `knowledgeBaseId` without a
      // pre-built `systemPrompt`. No client-side pre-fetch is needed, and
      // therefore no UI is gated on it.
      void sendMessage(
        { text },
        {
          body: {
            conversationId: convId,
            ...(kbId ? { knowledgeBaseId: kbId } : {}),
            searchMode,
            agentMode,
          },
        }
      ).catch((error) => {
        console.error("Chat send failed:", error);
      });
    } catch (error) {
      // createConversation (or sendMessage setup) failed before useChat took
      // over — clear the optimistic bubble so it doesn't linger forever.
      setOptimisticUserText(null);
      console.error("Chat submit failed:", error);
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  const handleRegenerate = () => {
    regenerate({
      body: {
        conversationId: conversationIdRef.current,
        ...(kbId ? { knowledgeBaseId: kbId } : {}),
        searchMode,
        agentMode,
      },
    });
  };

  // True while the model is actively producing a response — used to flip the
  // submit button into a stop control and to relax the empty-input disable.
  const isGenerating = status === "submitted" || status === "streaming";

  const lastMessageIsAssistant = lastMessage?.role === "assistant";

  // The optimistic bubble is shown only in the pre-send window (status "ready",
  // i.e. before sendMessage has run). Once status flips, useChat renders the real
  // bubble and the effect above clears `optimisticUserText`.
  const showOptimisticBubble =
    optimisticUserText !== null && status === "ready";
  // The standalone "thinking" bubble exists ONLY to fill the gap before a real
  // assistant message exists to host the loader: the optimistic pre-send window
  // (createConversation await) and the submitted-but-no-assistant-message-yet
  // window (server running the RAG pipeline before the stream's first part).
  // The moment the assistant message appears, the loader moves INSIDE that
  // message's unified container (see the text section below) — so we never show
  // a second bubble alongside the streaming answer.
  const showStandalonePending =
    optimisticUserText !== null || (isGenerating && !lastMessageIsAssistant);

  // The message list + optimistic/standalone bubbles. Rendered identically in
  // both scroll modes; only the outer container differs (native scroll for
  // "free", StickToBottom for the sticky modes).
  const messageNodes = (
    <>
      {messages.map((message, messageIndex) => {
              const isLastMessage = messageIndex === messages.length - 1;
              const isAssistant = message.role === "assistant";
              // While the answer is still streaming we hold the citation list
              // back, so the body text renders first and the references only
              // appear once the answer is complete.
              const isStreamingThisMessage =
                isLastMessage &&
                (status === "submitted" || status === "streaming");
              // `metadata` persists across reload (initialMessages); the live
              // thinking chain comes from `data-*` parts during the session.
              const messageMetadata = (
                message as { metadata?: AssistantMessageMetadata }
              ).metadata;
              // Live data parts (this session) take precedence; on a reload they
              // are gone, so we fall back to the persisted metadata.
              const parts = message.parts as Array<{
                type: string;
                data?: unknown;
              }>;
              const planPart = isAssistant
                ? (parts.find((p) => p.type === "data-plan")?.data as
                    | ChatDataParts["plan"]
                    | undefined)
                : undefined;
              const liveTrace = isAssistant
                ? parts
                    .filter((p) => p.type === "data-trace")
                    .map((p) => p.data as TraceStep)
                : [];
              const liveCitations = isAssistant
                ? (parts
                    .filter((p) => p.type === "data-citations")
                    .at(-1)?.data as MessageReference[] | undefined)
                : undefined;
              const readySignal = isAssistant
                ? parts.some((p) => p.type === "data-ready")
                : false;

              const references =
                liveCitations ??
                (isAssistant ? messageMetadata?.references ?? [] : []);
              const trace =
                liveTrace.length > 0
                  ? liveTrace
                  : isAssistant
                    ? messageMetadata?.trace ?? []
                    : [];
              // Agent-mode detection: a `data-plan` with `agent:true` (live),
              // any `tool-*` part (live), or a persisted `agentTrace` (rehydrated).
              const agentTrace: AgentTraceStep[] | undefined = isAssistant
                ? messageMetadata?.agentTrace
                : undefined;
              const hasLiveToolParts =
                isAssistant &&
                parts.some(
                  (p) =>
                    typeof p.type === "string" && p.type.startsWith("tool-")
                );
              const isAgentMessage =
                isAssistant &&
                (!!planPart?.agent ||
                  hasLiveToolParts ||
                  (agentTrace?.length ?? 0) > 0);
              // Gather reasoning + text up front so the answer renders as a
              // single unified block in the order thinking → text → citations,
              // instead of one bubble per part.
              const reasoningText = isAssistant
                ? message.parts
                    .filter(
                      (p): p is { type: "reasoning"; text: string } =>
                        p.type === "reasoning"
                    )
                    .map((p) => p.text)
                    .join("")
                : "";
              const textContent = message.parts
                .filter(
                  (p): p is { type: "text"; text: string } => p.type === "text"
                )
                .map((p) => p.text)
                .join("\n\n");
              const renderText =
                references.length > 0
                  ? preprocessCitations(
                      textContent,
                      references.length,
                      message.id
                    )
                  : textContent;

              return (
                <Fragment key={message.id}>
                  <Message from={message.role}>
                    <div
                      className={`w-full flex ${message.role === "user" ? "flex-row-reverse" : ""}`}
                    >
                      {message.role === "user" ? (
                        <div className="flex size-8 items-center justify-center rounded-xl bg-secondary text-secondary-foreground ring-1 ring-border">
                          <User className="size-4" strokeWidth={1.75} />
                        </div>
                      ) : (
                        <div className="flex size-8 items-center justify-center rounded-xl bg-primary/15 text-primary ring-1 ring-primary/25">
                          <Bot className="size-4" strokeWidth={1.75} />
                        </div>
                      )}
                    </div>
                    <MessageContent>
                      {isAssistant ? (
                        // Flat, borderless reply: a live thinking chain, then
                        // the answer, then citations — no card wrapper, so the
                        // loading state never looks boxed-in.
                        (() => {
                          const hasThinking =
                            isAgentMessage ||
                            !!planPart?.intro ||
                            trace.length > 0 ||
                            reasoningText.length > 0;
                          const hasAnswer = textContent.trim().length > 0;
                          return (
                            <div className="w-full">
                              {hasThinking &&
                                (isAgentMessage ? (
                                  <AgentThinkingChain
                                    intro={planPart?.intro}
                                    parts={
                                      message.parts as Array<
                                        Record<string, unknown>
                                      >
                                    }
                                    agentTrace={agentTrace}
                                    streaming={isStreamingThisMessage}
                                  />
                                ) : (
                                  <ThinkingChain
                                    intro={planPart?.intro}
                                    mode={planPart?.mode}
                                    steps={trace}
                                    reasoningText={reasoningText}
                                    streaming={isStreamingThisMessage}
                                    ready={readySignal}
                                  />
                                ))}
                              {hasAnswer ? (
                                <div className="pt-1">
                                  <MessageResponse
                                    components={assistantStreamdownComponents}
                                    // Disable Streamdown's lenient "incomplete
                                    // markdown" parsing. During streaming it
                                    // leaves the last inline link's href
                                    // undefined (more URL might be coming),
                                    // which rehype-harden then renders as
                                    // "[blocked]" — so citation chips like
                                    // [16][28][7] would show the last one as
                                    // blocked. Strict parsing renders a
                                    // half-arrived [7 as literal text and a
                                    // complete [7] as a chip, never a blocked
                                    // link. Rehydrated (complete) text was
                                    // already correct because it parses in one
                                    // shot.
                                    parseIncompleteMarkdown={false}
                                  >
                                    {renderText}
                                  </MessageResponse>
                                </div>
                              ) : (
                                // Assistant message exists but nothing has
                                // arrived yet — one unified bare loader.
                                isStreamingThisMessage &&
                                !hasThinking && <LoadingDots />
                              )}
                              {references.length > 0 &&
                                !isStreamingThisMessage && (
                                  <div className="pt-2">
                                    <CitationList
                                      messageId={message.id}
                                      references={references}
                                    />
                                  </div>
                                )}
                            </div>
                          );
                        })()
                      ) : (
                        <MessageResponse>{renderText}</MessageResponse>
                      )}
                    </MessageContent>
                  </Message>
                  {isAssistant && isLastMessage && (
                    <MessageActions>
                      <MessageAction
                        onClick={handleRegenerate}
                        label="Retry"
                      >
                        <RefreshCcwIcon className="size-3" />
                      </MessageAction>
                      <MessageAction
                        onClick={() =>
                          navigator.clipboard.writeText(textContent)
                        }
                        label="Copy"
                      >
                        <CopyIcon className="size-3" />
                      </MessageAction>
                    </MessageActions>
                  )}
                </Fragment>
              );
            })}
            {showOptimisticBubble && (
              <Message from="user">
                <div className="w-full flex flex-row-reverse">
                  <div className="flex size-8 items-center justify-center rounded-xl bg-secondary text-secondary-foreground ring-1 ring-border">
                    <User className="size-4" strokeWidth={1.75} />
                  </div>
                </div>
                <MessageContent>
                  <MessageResponse>{optimisticUserText}</MessageResponse>
                </MessageContent>
              </Message>
            )}
            {showStandalonePending && (
              <Message from="assistant">
                <div className="w-full flex">
                  <div className="flex size-8 items-center justify-center rounded-xl bg-primary/15 text-primary ring-1 ring-primary/25">
                    <Bot className="size-4" strokeWidth={1.75} />
                  </div>
                </div>
                <MessageContent>
                  <LoadingDots />
                </MessageContent>
              </Message>
            )}
    </>
  );

  return (
    <div className="w-full mx-auto p-6 relative h-full">
      <div className="flex flex-col h-full">
        {scrollMode === "free" ? (
          // Free mode: a plain native scroll container. The browser does NOT
          // react to content growth, so the scrollbar is entirely under user
          // control — new AI output simply grows below the current viewport.
          <div
            className="relative flex-1 overflow-y-auto min-h-0"
            role="log"
          >
            <div className="flex flex-col gap-8 p-4">{messageNodes}</div>
          </div>
        ) : (
          <Conversation className="min-h-0">
            <ConversationContent>{messageNodes}</ConversationContent>
            <ChatScrollController
              mode={scrollMode}
              status={status}
              messageCount={messages.length}
              lastMessageSignature={lastMessageSignature}
            />
            <ConversationScrollButton />
          </Conversation>
        )}

        <div className="mt-4 w-full max-w-2xl mx-auto shrink-0 animate-rise-in">
          <PromptInput
            onSubmit={handleSubmit}
            className={cn(
              "w-full",
              // Unify the composer into one elevated surface: softer rounding
              // + the theme's tinted ambient shadow on the InputGroup box.
              "[&_[data-slot=input-group]]:rounded-2xl [&_[data-slot=input-group]]:shadow-[var(--shadow-ambient)]"
            )}
          >
            <PromptInputTextarea
              value={input}
              placeholder="输入你的问题…"
              onChange={(e) => setInput(e.currentTarget.value)}
            />
            <PromptInputFooter className="flex-wrap gap-2">
              {/* Toolbar: knowledge-base picker + retrieval-mode segmented control. */}
              <PromptInputTools className="gap-1.5">
                <Select value={selectedKbId} onValueChange={handleKbChange}>
                  <SelectTrigger
                    size="sm"
                    className={cn(
                      "gap-1.5 px-2 border-0 bg-transparent shadow-none focus-visible:ring-0",
                      kbActive ? "text-foreground" : "text-muted-foreground"
                    )}
                  >
                    <BookOpen className="size-3.5" />
                    <span className="max-w-[10rem] truncate">{kbLabel}</span>
                  </SelectTrigger>
                  <SelectContent position="popper" sideOffset={4}>
                    <SelectItem value="none">不使用知识库</SelectItem>
                    {knowledgeBases.map((kb) => (
                      <SelectItem key={kb.id} value={String(kb.id)}>
                        {kb.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Engine toggle: pipeline (fixed retrieval, fast) vs Agent
                    (model-driven retrieval loop, richer thinking chain). In
                    Agent mode the model picks the channel itself, so the
                    per-channel control below is hidden. */}
                <div className="flex items-center gap-0.5 rounded-md bg-muted/50 p-0.5">
                  <button
                    type="button"
                    onClick={() => setAgentMode(false)}
                    aria-pressed={!agentMode}
                    className={cn(
                      "h-6 rounded-[5px] px-2 text-xs font-medium transition-colors",
                      !agentMode
                        ? "bg-primary/15 text-primary ring-1 ring-primary/25"
                        : "text-muted-foreground hover:bg-accent hover:text-foreground"
                    )}
                  >
                    流水线
                  </button>
                  <button
                    type="button"
                    onClick={() => setAgentMode(true)}
                    aria-pressed={agentMode}
                    className={cn(
                      "h-6 rounded-[5px] px-2 text-xs font-medium transition-colors",
                      agentMode
                        ? "bg-primary/15 text-primary ring-1 ring-primary/25"
                        : "text-muted-foreground hover:bg-accent hover:text-foreground"
                    )}
                  >
                    Agent
                  </button>
                </div>

                {/* Per-channel retrieval modes — pipeline only. Agent mode
                    lets the model choose the channel per query. */}
                {!agentMode && (
                  <div className="flex items-center gap-0.5 rounded-md bg-muted/50 p-0.5">
                    {SEARCH_MODES.map((mode) => {
                      const active = searchMode === mode.value;
                      return (
                        <button
                          key={mode.value}
                          type="button"
                          onClick={() => handleSearchModeChange(mode.value)}
                          aria-pressed={active}
                          className={cn(
                            "h-6 rounded-[5px] px-2 text-xs font-medium transition-colors",
                            active
                              ? "bg-primary/15 text-primary ring-1 ring-primary/25"
                              : "text-muted-foreground hover:bg-accent hover:text-foreground"
                          )}
                        >
                          {mode.label}
                        </button>
                      );
                    })}
                  </div>
                )}
              </PromptInputTools>

              <PromptInputSubmit
                status={status}
                onStop={stop}
                disabled={isSubmitting || (!isGenerating && !input.trim())}
              />
            </PromptInputFooter>
          </PromptInput>
        </div>
      </div>
    </div>
  );
}
