"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { MessageSquarePlus, Pencil, Trash2, MessageSquare } from "lucide-react";
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

function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diff = Date.now() - then;
  const min = Math.floor(diff / 60000);
  if (min < 1) return "刚刚";
  if (min < 60) return `${min} 分钟前`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} 小时前`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day} 天前`;
  return new Date(iso).toLocaleDateString("zh-CN");
}

interface ConversationSidebarProps {
  conversations: ConversationItem[];
  currentConversationId?: string;
  pendingTitles: Set<string>;
  onSelect: (id: string) => void;
  onNew: () => void;
  onTitleUpdate: (id: string, title: string) => void;
  onDelete: (id: string) => void;
}

function RenameDialog({
  conversation,
  open,
  onOpenChange,
  onSuccess,
}: {
  conversation: ConversationItem;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSuccess: (title: string) => void;
}) {
  const [titleValue, setTitleValue] = useState(conversation.title ?? "");
  const submittedTitleRef = useRef<string | null>(null);
  const [state, formAction, isPending] = useActionState(
    updateConversationTitleAction,
    {}
  );

  // Sync input when dialog reopens
  useEffect(() => {
    if (open) setTitleValue(conversation.title ?? "");
  }, [open, conversation.title]);

  useEffect(() => {
    if (state.success && submittedTitleRef.current !== null) {
      onSuccess(submittedTitleRef.current);
      submittedTitleRef.current = null;
      onOpenChange(false);
    }
  }, [state.success, onOpenChange, onSuccess]);

  const handleFormAction = (formData: FormData) => {
    submittedTitleRef.current = (formData.get("title") as string)?.trim() ?? "";
    formAction(formData);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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
          {state.error && (
            <p className="text-sm text-destructive">{state.error}</p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
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
  open,
  onOpenChange,
  onSuccess,
}: {
  conversation: ConversationItem;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSuccess: () => void;
}) {
  const [state, formAction, isPending] = useActionState(
    deleteConversationAction,
    {}
  );

  useEffect(() => {
    if (state.success) {
      onSuccess();
      onOpenChange(false);
    }
  }, [state.success, onSuccess, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>删除对话</DialogTitle>
          <DialogDescription>
            确定要删除「{conversation.title ?? "此对话"}
            」吗？所有消息记录将被清空，此操作不可撤销。
          </DialogDescription>
        </DialogHeader>
        {state.error && (
          <p className="text-sm text-destructive">{state.error}</p>
        )}
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
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

function ConversationItemRow({
  conversation,
  isActive,
  isPendingTitle,
  onSelect,
  onTitleUpdate,
  onDelete,
}: {
  conversation: ConversationItem;
  isActive: boolean;
  isPendingTitle: boolean;
  onSelect: () => void;
  onTitleUpdate: (title: string) => void;
  onDelete: () => void;
}) {
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  return (
    <>
      <div
        className={cn(
          "group relative flex items-center gap-2.5 rounded-lg px-2.5 py-2 cursor-pointer transition-colors hover:bg-muted/60",
          "before:absolute before:left-0 before:top-1/2 before:h-0 before:w-0.5 before:-translate-y-1/2 before:rounded-full before:bg-primary before:transition-all",
          isActive && "bg-accent/60 before:h-5"
        )}
        onClick={onSelect}
      >
        <MessageSquare
          className={cn(
            "size-4 shrink-0 transition-colors",
            isActive ? "text-primary" : "text-muted-foreground"
          )}
        />
        <div className="flex-1 min-w-0">
          {isPendingTitle ? (
            <Skeleton className="h-4 w-24" />
          ) : (
            <p
              className={cn(
                "text-sm truncate",
                isActive ? "font-medium text-foreground" : "text-foreground/90"
              )}
            >
              {conversation.title ?? "新对话"}
            </p>
          )}
          <p className="mt-0.5 font-mono text-[10px] tracking-tight text-muted-foreground">
            {formatRelativeTime(conversation.updated_at)}
          </p>
        </div>
        {/* Action buttons, visible on hover */}
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button
            variant="ghost"
            size="icon-sm"
            className="size-6 text-muted-foreground hover:text-foreground"
            onClick={(e) => {
              e.stopPropagation();
              setRenameOpen(true);
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
              setDeleteOpen(true);
            }}
          >
            <Trash2 className="size-3" />
          </Button>
        </div>
      </div>

      <RenameDialog
        conversation={conversation}
        open={renameOpen}
        onOpenChange={setRenameOpen}
        onSuccess={onTitleUpdate}
      />
      <DeleteDialog
        conversation={conversation}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        onSuccess={onDelete}
      />
    </>
  );
}

export function ConversationSidebar({
  conversations,
  currentConversationId,
  pendingTitles,
  onSelect,
  onNew,
  onTitleUpdate,
  onDelete,
}: ConversationSidebarProps) {
  return (
    <div className="w-60 shrink-0 flex flex-col h-full bg-muted/20 p-3 gap-3">
      <Button
        size="sm"
        className="w-full justify-start gap-2 transition-transform active:scale-[0.98]"
        onClick={onNew}
      >
        <MessageSquarePlus className="size-4" />
        新对话
      </Button>

      <div className="flex items-center justify-between px-1">
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          对话历史
        </span>
        {conversations.length > 0 && (
          <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
            {conversations.length}
          </span>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-0.5 -mx-1 px-1">
        {conversations.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center text-muted-foreground">
            <MessageSquare className="size-6 opacity-40" />
            <p className="text-xs">暂无对话记录</p>
          </div>
        ) : (
          conversations.map((conv) => (
            <ConversationItemRow
              key={conv.id}
              conversation={conv}
              isActive={conv.id === currentConversationId}
              isPendingTitle={pendingTitles.has(conv.id)}
              onSelect={() => onSelect(conv.id)}
              onTitleUpdate={(title) => onTitleUpdate(conv.id, title)}
              onDelete={() => onDelete(conv.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}
