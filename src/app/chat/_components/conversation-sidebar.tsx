"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  Search,
  Pencil,
  Trash2,
  Plus,
  MessagesSquare,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import {
  updateConversationTitleAction,
  deleteConversationAction,
} from "@/actions/conversation";
import { cn } from "@/lib/utils";
import type { ConversationItem } from "./chat-shell";

/* ------------------------------------------------------------------ */
/* Helpers & motifs                                                   */
/* ------------------------------------------------------------------ */

function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diff = Date.now() - then;
  const min = Math.floor(diff / 60000);
  if (min < 1) return "刚刚";
  if (min < 60) return `${min}分前`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}时前`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}天前`;
  return new Date(iso).toLocaleDateString("zh-CN");
}

/**
 * Interweaving wavy lines — the CodeWeaver brand mark. Two sine-like paths
 * crossing evokes "weaving documents into a knowledge network".
 */
function WovenMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      strokeWidth="1.6"
      strokeLinecap="round"
      className={className}
      aria-hidden
    >
      <path d="M3 9c4 0 4 6 9 6s5-6 9-6" stroke="currentColor" opacity="0.45" />
      <path d="M3 15c4 0 4-6 9-6s5 6 9 6" stroke="currentColor" />
    </svg>
  );
}

/** Calm decorative divider used under the panel search row. */
function WovenDivider({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 200 6"
      fill="none"
      preserveAspectRatio="none"
      className={className}
      aria-hidden
    >
      <path d="M0 3c20 0 20-2.4 40-2.4s20 4.8 40 4.8 20-2.4 40-2.4 20 2.4 40 2.4" stroke="currentColor" strokeWidth="1" />
      <path d="M0 3c20 0 20 2.4 40 2.4s20-4.8 40-4.8 20 2.4 40 2.4 20-2.4 40-2.4" stroke="currentColor" strokeWidth="1" opacity="0.5" />
    </svg>
  );
}

interface Group {
  label: string;
  items: ConversationItem[];
}

function groupConversations(items: ConversationItem[]): Group[] {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfYesterday = startOfToday - 86_400_000;
  const startOfWeek = startOfToday - 6 * 86_400_000;

  const buckets: Record<string, ConversationItem[]> = {
    今天: [],
    昨天: [],
    本周: [],
    更早: [],
  };

  for (const c of items) {
    const t = new Date(c.updated_at).getTime();
    if (t >= startOfToday) buckets.今天.push(c);
    else if (t >= startOfYesterday) buckets.昨天.push(c);
    else if (t >= startOfWeek) buckets.本周.push(c);
    else buckets.更早.push(c);
  }

  return (["今天", "昨天", "本周", "更早"] as const)
    .map((label) => ({ label, items: buckets[label] }))
    .filter((g) => g.items.length > 0);
}

/* ------------------------------------------------------------------ */
/* Dialogs (rename / delete) — useActionState mechanism preserved    */
/* ------------------------------------------------------------------ */

function RenameDialog({
  conversation,
  onDone,
  onSuccess,
}: {
  conversation: ConversationItem;
  onDone: () => void;
  onSuccess: (title: string) => void;
}) {
  const [titleValue, setTitleValue] = useState(conversation.title ?? "");
  const submittedTitleRef = useRef<string | null>(null);
  const [state, formAction, isPending] = useActionState(
    updateConversationTitleAction,
    {}
  );

  useEffect(() => {
    if (state.success && submittedTitleRef.current !== null) {
      onSuccess(submittedTitleRef.current);
      submittedTitleRef.current = null;
      onDone();
    }
  }, [state.success, onSuccess, onDone]);

  const handleFormAction = (formData: FormData) => {
    submittedTitleRef.current = (formData.get("title") as string)?.trim() ?? "";
    formAction(formData);
  };

  return (
    <Dialog open onOpenChange={onDone}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>修改标题</DialogTitle>
        </DialogHeader>
        <form action={handleFormAction} className="flex flex-col gap-4">
          <input type="hidden" name="id" value={conversation.id} />
          <Input
            name="title"
            value={titleValue}
            onChange={(e) => setTitleValue(e.target.value)}
            placeholder="请输入新标题"
            autoFocus
          />
          {state.error && <p className="text-sm text-destructive">{state.error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onDone} disabled={isPending}>
              取消
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? <Spinner className="size-4" /> : "保存"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteDialog({
  conversation,
  onDone,
  onSuccess,
}: {
  conversation: ConversationItem;
  onDone: () => void;
  onSuccess: () => void;
}) {
  const [state, formAction, isPending] = useActionState(
    deleteConversationAction,
    {}
  );

  useEffect(() => {
    if (state.success) {
      onSuccess();
      onDone();
    }
  }, [state.success, onSuccess, onDone]);

  return (
    <Dialog open onOpenChange={onDone}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>删除对话</DialogTitle>
          <DialogDescription>
            确定要删除「{conversation.title ?? "此对话"}
            」吗？所有消息记录将被清空，此操作不可撤销。
          </DialogDescription>
        </DialogHeader>
        {state.error && <p className="text-sm text-destructive">{state.error}</p>}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onDone} disabled={isPending}>
            取消
          </Button>
          <form action={formAction}>
            <input type="hidden" name="id" value={conversation.id} />
            <Button variant="destructive" type="submit" disabled={isPending}>
              {isPending ? <Spinner className="size-4" /> : "删除"}
            </Button>
          </form>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* Main switcher                                                      */
/* ------------------------------------------------------------------ */

interface ConversationSidebarProps {
  conversations: ConversationItem[];
  currentConversationId?: string;
  pendingTitles: Set<string>;
  onSelect: (id: string) => void;
  onNew: () => void;
  onTitleUpdate: (id: string, title: string) => void;
  onDelete: (id: string) => void;
}

/**
 * Conversation switcher — a calm title bar that blends into the chat.
 *
 * No new-chat button (the app's icon sidebar owns that). The whole title
 * cluster opens a floating panel: search, time grouping, keyboard nav,
 * rename/delete. The bar reads as one continuous, refined surface with the
 * conversation below.
 */
export function ConversationSidebar({
  conversations,
  currentConversationId,
  pendingTitles,
  onSelect,
  onNew,
  onTitleUpdate,
  onDelete,
}: ConversationSidebarProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const [renameTarget, setRenameTarget] = useState<ConversationItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ConversationItem | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const current = conversations.find((c) => c.id === currentConversationId);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter((c) =>
      (c.title ?? "新对话").toLowerCase().includes(q)
    );
  }, [conversations, query]);

  const groups = useMemo(() => groupConversations(filtered), [filtered]);

  const flatIndex = useMemo(() => {
    const m = new Map<string, number>();
    let i = 0;
    for (const g of groups) for (const c of g.items) m.set(c.id, i++);
    return m;
  }, [groups]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    if (open) {
      const id = window.setTimeout(() => searchRef.current?.focus(), 30);
      return () => window.clearTimeout(id);
    }
  }, [open]);

  const openPanel = () => {
    setQuery("");
    setSelected(0);
    setOpen(true);
  };
  const closePanel = () => setOpen(false);

  const handleSearchKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelected((s) => Math.min(s + 1, Math.max(0, filtered.length - 1)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelected((s) => Math.max(0, s - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const c = filtered[selected];
      if (c) {
        onSelect(c.id);
        setOpen(false);
      }
    }
  };

  return (
    <div className="relative z-30">
      <style>{`@keyframes cw-panel-in{from{opacity:0;transform:translateY(-6px) scale(.985)}to{opacity:1;transform:translateY(0) scale(1)}}.cw-panel{animation:cw-panel-in .2s cubic-bezier(.22,1,.36,1)}@media(prefers-reduced-motion:reduce){.cw-panel{animation:none}}`}</style>

      {/* --- Calm title bar --- */}
      <div
        className={cn(
          "flex items-center gap-2 px-4 h-11 transition-colors",
          open ? "bg-accent/30" : "bg-transparent"
        )}
      >
        <button
          type="button"
          onClick={() => (open ? closePanel() : openPanel())}
          className={cn(
            "group flex min-w-0 items-center gap-2.5 rounded-lg border px-2.5 h-8 transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            open
              ? "border-primary/45 bg-accent/55"
              : "border-border/70 bg-card/40 hover:border-primary/35 hover:bg-accent/35"
          )}
          aria-expanded={open}
          title="查看历史对话 / 新建对话"
        >
          <WovenMark
            className={cn(
              "size-[18px] shrink-0 transition-colors",
              open ? "text-primary" : "text-primary/80 group-hover:text-primary"
            )}
          />
          <span
            className={cn(
              "min-w-0 truncate text-[13px] leading-none transition-colors",
              current ? "text-foreground/85" : "text-muted-foreground"
            )}
          >
            {current ? current.title ?? "新对话" : "选择历史对话"}
          </span>
          {conversations.length > 0 && (
            <span className="shrink-0 rounded-full bg-muted/70 px-1.5 font-mono text-[9px] leading-[1.4] tabular-nums text-muted-foreground">
              {conversations.length}
            </span>
          )}
          <ChevronDown
            className={cn(
              "size-3.5 shrink-0 transition-all duration-200",
              open ? "rotate-180 text-primary" : "text-muted-foreground/60 group-hover:text-primary"
            )}
          />
        </button>

        {/* faint hairline that completes the bar without a hard edge */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-border/60 to-transparent" />
      </div>

      {/* --- Floating panel --- */}
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={closePanel} aria-hidden />
          <div className="cw-panel absolute left-4 right-4 top-[52px] z-50 mx-auto w-[440px] max-w-[calc(100vw-2rem)]">
            {/* ambient brand glow */}
            <div className="pointer-events-none absolute -right-10 -top-10 -z-10 size-40 rounded-full bg-primary/10 blur-3xl" />

            <div className="overflow-hidden rounded-xl border border-border/80 bg-card/95 shadow-[var(--shadow-ambient)] ring-1 ring-primary/10 backdrop-blur-xl">
              {/* Search header */}
              <div className="flex items-center gap-2 border-b border-border/70 px-3.5 py-2.5">
                <Search className="size-3.5 shrink-0 text-muted-foreground" />
                <Input
                  ref={searchRef}
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setSelected(0);
                  }}
                  onKeyDown={handleSearchKey}
                  placeholder="搜索对话…"
                  className="h-6 border-0 bg-transparent px-0 text-[13px] shadow-none focus-visible:ring-0"
                />
                <span className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground">
                  {filtered.length}
                </span>
              </div>

              {/* New conversation — primary action at the top of the panel */}
              <div className="px-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    onNew();
                    closePanel();
                  }}
                  className="group flex w-full items-center gap-2.5 rounded-lg px-2 py-2 transition-colors hover:bg-primary/8"
                >
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-primary/12 text-primary ring-1 ring-primary/20 transition-colors group-hover:bg-primary/18">
                    <Plus className="size-3.5" strokeWidth={2.2} />
                  </span>
                  <span className="text-[13px] font-medium text-foreground/90">
                    新建对话
                  </span>
                  <ChevronDown
                    className={cn(
                      "ml-auto size-3 -rotate-90 text-muted-foreground/50 transition-colors group-hover:text-primary"
                    )}
                  />
                </button>
              </div>

              <div className="px-3.5 pt-1.5">
                <WovenDivider className="h-1.5 w-full text-primary/20" />
              </div>

              {/* List */}
              <div className="max-h-[58vh] overflow-y-auto p-2">
                {filtered.length === 0 ? (
                  <div className="flex flex-col items-center gap-2.5 px-4 py-12 text-center">
                    <WovenMark className="size-8 text-primary/30" />
                    <p className="text-[13px] text-muted-foreground">
                      {query ? `未找到「${query}」相关对话` : "还没有对话记录"}
                    </p>
                    {!query && (
                      <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground/60">
                        在输入框发送消息即可开始
                      </p>
                    )}
                  </div>
                ) : (
                  groups.map((g, gi) => (
                    <div key={g.label} className={cn(gi > 0 && "mt-3")}>
                      <div className="flex items-center justify-between px-2 py-1">
                        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                          {g.label}
                        </span>
                        <span className="font-mono text-[10px] tabular-nums text-muted-foreground/60">
                          {g.items.length}
                        </span>
                      </div>
                      <div className="flex flex-col gap-px">
                        {g.items.map((c) => {
                          const idx = flatIndex.get(c.id) ?? 0;
                          const isActive = c.id === currentConversationId;
                          const isSel = idx === selected;
                          const pending = pendingTitles.has(c.id);
                          return (
                            <div
                              key={c.id}
                              onMouseEnter={() => setSelected(idx)}
                              onClick={() => {
                                onSelect(c.id);
                                setOpen(false);
                              }}
                              className={cn(
                                "group relative flex cursor-pointer items-center gap-2.5 rounded-lg py-2 pl-3 pr-2 transition-colors",
                                isActive
                                  ? "bg-accent/55"
                                  : isSel
                                    ? "bg-muted/45"
                                    : "hover:bg-muted/35"
                              )}
                            >
                              <span
                                className={cn(
                                  "absolute left-0.5 top-1/2 h-0 w-[2px] -translate-y-1/2 rounded-full bg-primary transition-all duration-200",
                                  isActive ? "h-5 opacity-100" : "opacity-0"
                                )}
                              />
                              <MessagesSquare
                                className={cn(
                                  "size-3.5 shrink-0",
                                  isActive ? "text-primary" : "text-muted-foreground/80"
                                )}
                              />
                              <div className="min-w-0 flex-1">
                                {pending ? (
                                  <Skeleton className="h-3.5 w-24" />
                                ) : (
                                  <p
                                    className={cn(
                                      "truncate text-[13px] leading-snug",
                                      isActive ? "font-medium text-foreground" : "text-foreground/85"
                                    )}
                                  >
                                    {c.title ?? "新对话"}
                                  </p>
                                )}
                              </div>
                              <span className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground/80">
                                {formatRelativeTime(c.updated_at)}
                              </span>
                              <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  className="size-6 text-muted-foreground hover:text-foreground"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setRenameTarget(c);
                                  }}
                                >
                                  <Pencil className="size-3" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  className="size-6 text-muted-foreground hover:text-destructive"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setDeleteTarget(c);
                                  }}
                                >
                                  <Trash2 className="size-3" />
                                </Button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Footer hint */}
              <div className="flex items-center justify-between border-t border-border/70 px-3.5 py-2">
                <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground/60">
                  ↑↓ 选择 · ↵ 打开 · esc 关闭
                </span>
                <span className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground/60">
                  <WovenMark className="size-3 text-primary/50" />
                  CodeWeaver
                </span>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Dialogs (mounted on demand) */}
      {renameTarget && (
        <RenameDialog
          conversation={renameTarget}
          onDone={() => setRenameTarget(null)}
          onSuccess={(title) => onTitleUpdate(renameTarget.id, title)}
        />
      )}
      {deleteTarget && (
        <DeleteDialog
          conversation={deleteTarget}
          onDone={() => setDeleteTarget(null)}
          onSuccess={() => onDelete(deleteTarget.id)}
        />
      )}
    </div>
  );
}
