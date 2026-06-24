"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { UIMessage } from "ai";
import { ArrowDownIcon, DownloadIcon } from "lucide-react";
import { type ComponentProps, useCallback, useEffect } from "react";
import { StickToBottom, useStickToBottomContext } from "use-stick-to-bottom";

export type ChatScrollMode = "bottom-auto" | "force-bottom" | "free";

export type ConversationProps = ComponentProps<typeof StickToBottom>;

export const Conversation = ({ className, ...props }: ConversationProps) => (
  <StickToBottom
    className={cn("relative flex-1 overflow-y-hidden", className)}
    initial="smooth"
    resize="smooth"
    role="log"
    {...props}
  />
);

export type ConversationContentProps = ComponentProps<
  typeof StickToBottom.Content
>;

export const ConversationContent = ({
  className,
  ...props
}: ConversationContentProps) => (
  <StickToBottom.Content
    className={cn("flex flex-col gap-8 p-4", className)}
    {...props}
  />
);

export type ChatScrollControllerProps = {
  mode: ChatScrollMode;
  /**
   * `useChat` status: "ready" | "submitted" | "streaming" | "error". Drives
   * when to lock the user to the bottom in force-bottom mode.
   */
  status: string;
  /** messages.length — a new message signals "user just sent". */
  messageCount: number;
  /**
   * A value that changes as the streaming assistant reply grows (e.g. the
   * length of the last message's text). Used to re-pin to the bottom on each
   * content tick without scrolling on every animation frame.
   */
  lastMessageSignature: number;
};

/**
 * Imperative scroll control layered on top of StickToBottom's declarative
 * behavior. Must be rendered inside <Conversation> so it can reach the
 * stick-to-bottom context.
 *
 * Only force-bottom mode is active here:
 * - the instant a message is sent (status -> "submitted"), jump to the bottom;
 * - while streaming, on every content growth tick, force-scroll to the bottom
 *   with `ignoreEscapes` so the user cannot scroll away from the latest reply.
 *
 * bottom-auto relies entirely on the library's native stickiness; free mode
 * never renders <Conversation> at all (a plain native-scroll div is used
 * instead), so the controller is only ever mounted for the two sticky modes.
 */
export const ChatScrollController = ({
  mode,
  status,
  messageCount,
  lastMessageSignature,
}: ChatScrollControllerProps) => {
  const { scrollToBottom } = useStickToBottomContext();

  useEffect(() => {
    if (mode !== "force-bottom") return;
    if (status === "submitted" || status === "streaming") {
      scrollToBottom({ ignoreEscapes: true });
    }
    // We intentionally depend on the signature/count so we re-pin on every
    // content growth tick; ignoreEscapes keeps the user locked at the bottom.
  }, [mode, status, messageCount, lastMessageSignature, scrollToBottom]);

  return null;
};

export type ConversationEmptyStateProps = ComponentProps<"div"> & {
  title?: string;
  description?: string;
  icon?: React.ReactNode;
};

export const ConversationEmptyState = ({
  className,
  title = "No messages yet",
  description = "Start a conversation to see messages here",
  icon,
  children,
  ...props
}: ConversationEmptyStateProps) => (
  <div
    className={cn(
      "flex size-full flex-col items-center justify-center gap-3 p-8 text-center",
      className
    )}
    {...props}
  >
    {children ?? (
      <>
        {icon && <div className="text-muted-foreground">{icon}</div>}
        <div className="space-y-1">
          <h3 className="font-medium text-sm">{title}</h3>
          {description && (
            <p className="text-muted-foreground text-sm">{description}</p>
          )}
        </div>
      </>
    )}
  </div>
);

export type ConversationScrollButtonProps = ComponentProps<typeof Button>;

export const ConversationScrollButton = ({
  className,
  ...props
}: ConversationScrollButtonProps) => {
  const { isAtBottom, scrollToBottom } = useStickToBottomContext();

  const handleScrollToBottom = useCallback(() => {
    scrollToBottom();
  }, [scrollToBottom]);

  return (
    !isAtBottom && (
      <Button
        className={cn(
          "absolute bottom-4 left-[50%] translate-x-[-50%] rounded-full dark:bg-background dark:hover:bg-muted",
          className
        )}
        onClick={handleScrollToBottom}
        size="icon"
        type="button"
        variant="outline"
        {...props}
      >
        <ArrowDownIcon className="size-4" />
      </Button>
    )
  );
};

const getMessageText = (message: UIMessage): string =>
  message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("");

export type ConversationDownloadProps = Omit<
  ComponentProps<typeof Button>,
  "onClick"
> & {
  messages: UIMessage[];
  filename?: string;
  formatMessage?: (message: UIMessage, index: number) => string;
};

const defaultFormatMessage = (message: UIMessage): string => {
  const roleLabel =
    message.role.charAt(0).toUpperCase() + message.role.slice(1);
  return `**${roleLabel}:** ${getMessageText(message)}`;
};

export const messagesToMarkdown = (
  messages: UIMessage[],
  formatMessage: (
    message: UIMessage,
    index: number
  ) => string = defaultFormatMessage
): string => messages.map((msg, i) => formatMessage(msg, i)).join("\n\n");

export const ConversationDownload = ({
  messages,
  filename = "conversation.md",
  formatMessage = defaultFormatMessage,
  className,
  children,
  ...props
}: ConversationDownloadProps) => {
  const handleDownload = useCallback(() => {
    const markdown = messagesToMarkdown(messages, formatMessage);
    const blob = new Blob([markdown], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }, [messages, filename, formatMessage]);

  return (
    <Button
      className={cn(
        "absolute top-4 right-4 rounded-full dark:bg-background dark:hover:bg-muted",
        className
      )}
      onClick={handleDownload}
      size="icon"
      type="button"
      variant="outline"
      {...props}
    >
      {children ?? <DownloadIcon className="size-4" />}
    </Button>
  );
};
