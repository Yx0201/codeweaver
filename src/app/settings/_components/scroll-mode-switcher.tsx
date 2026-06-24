"use client";

import { useEffect, useState } from "react";
import {
  ArrowDownToLine,
  Pin,
  MoveVertical,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useChatScroll,
} from "@/components/settings/chat-scroll-provider";
import type { ChatScrollMode } from "@/components/ai-elements/conversation";

const options: {
  value: ChatScrollMode;
  label: string;
  description: string;
  icon: typeof ArrowDownToLine;
}[] = [
  {
    value: "bottom-auto",
    label: "底部自动",
    description: "在底部时自动滚动,上滑后暂停",
    icon: ArrowDownToLine,
  },
  {
    value: "force-bottom",
    label: "强制底部",
    description: "始终滚到最新回复,上滑也会被拉回",
    icon: Pin,
  },
  {
    value: "free",
    label: "自由",
    description: "系统不干预滚动条,停留在当前位置",
    icon: MoveVertical,
  },
];

export function ScrollModeSwitcher() {
  const { scrollMode, setScrollMode } = useChatScroll();
  // The provider only knows the real persisted choice after mount; render an
  // inert state until then to prevent a hydration mismatch on the selected
  // indicator.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <div className="grid gap-2 sm:grid-cols-3">
      {options.map((opt) => {
        const isActive = mounted && scrollMode === opt.value;
        const Icon = opt.icon;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => setScrollMode(opt.value)}
            aria-pressed={isActive}
            className={cn(
              "group relative flex flex-col items-start gap-2.5 rounded-xl border bg-card p-4 text-left transition-all duration-200",
              "hover:border-primary/40 hover:bg-accent/30",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              "active:scale-[0.99]",
              isActive
                ? "border-primary/60 bg-accent/40 shadow-[var(--shadow-ambient)]"
                : "border-border"
            )}
          >
            <span
              className={cn(
                "flex size-9 items-center justify-center rounded-lg ring-1 transition-colors",
                isActive
                  ? "bg-primary/15 text-primary ring-primary/25"
                  : "bg-muted text-muted-foreground ring-border"
              )}
            >
              <Icon className="size-4.5" strokeWidth={1.75} />
            </span>
            <div>
              <p className="text-sm font-medium tracking-tight">{opt.label}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {opt.description}
              </p>
            </div>
            {isActive && (
              <span className="absolute right-3 top-3 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <Check className="size-3" strokeWidth={3} />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
