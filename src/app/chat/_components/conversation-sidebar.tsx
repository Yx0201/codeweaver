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
          "group flex items-center gap-2 rounded-lg px-2 py-2 cursor-pointer hover:bg-muted/60 transition-colors",
          isActive && "bg-muted"
        )}
        onClick={onSelect}
      >
        <MessageSquare className="size-4 shrink-0 text-muted-foreground" />
        <div className="flex-1 min-w-0">
          {isPendingTitle ? (
            <Skeleton className="h-4 w-24" />
          ) : (
            <p className="text-sm truncate">
              {conversation.title ?? "新对话"}
            </p>
          )}
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
    <div className="w-56 shrink-0 flex flex-col h-full bg-muted/20 p-2 gap-2">
      <Button
        variant="outline"
        size="sm"
        className="w-full justify-start gap-2"
        onClick={onNew}
      >
        <MessageSquarePlus className="size-4" />
        新对话
      </Button>

      <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-0.5">
        {conversations.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-6">
            暂无对话记录
          </p>
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
