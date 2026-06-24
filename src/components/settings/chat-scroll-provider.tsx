"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import type { ChatScrollMode } from "@/components/ai-elements/conversation";

const STORAGE_KEY = "chat-scroll-mode";
const DEFAULT_MODE: ChatScrollMode = "bottom-auto";

function readStoredMode(): ChatScrollMode {
  if (typeof window === "undefined") return DEFAULT_MODE;
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === "bottom-auto" ||
    stored === "force-bottom" ||
    stored === "free"
    ? stored
    : DEFAULT_MODE;
}

interface ChatScrollContextValue {
  scrollMode: ChatScrollMode;
  setScrollMode: (mode: ChatScrollMode) => void;
}

const ChatScrollContext = createContext<ChatScrollContextValue | null>(null);

export function ChatScrollProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  // Default on first render (SSR-safe); the real persisted choice is synced in
  // an effect after mount to avoid hydration mismatches.
  const [scrollMode, setScrollModeState] =
    useState<ChatScrollMode>(DEFAULT_MODE);

  useEffect(() => {
    setScrollModeState(readStoredMode());
  }, []);

  const setScrollMode = useCallback((next: ChatScrollMode) => {
    setScrollModeState(next);
    localStorage.setItem(STORAGE_KEY, next);
  }, []);

  return (
    <ChatScrollContext.Provider value={{ scrollMode, setScrollMode }}>
      {children}
    </ChatScrollContext.Provider>
  );
}

export function useChatScroll(): ChatScrollContextValue {
  const ctx = useContext(ChatScrollContext);
  if (!ctx)
    throw new Error("useChatScroll must be used within a ChatScrollProvider");
  return ctx;
}
