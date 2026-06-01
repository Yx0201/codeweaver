"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { BookOpen, Trash2 } from "lucide-react";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { deleteKnowledgeBaseAction } from "@/actions/knowledge";

interface KnowledgeBaseCardProps {
  id: number;
  name: string;
  description: string | null;
  fileCount: number;
  createdAt: string;
}

export function KnowledgeBaseCard({
  id,
  name,
  description,
  fileCount,
  createdAt,
}: KnowledgeBaseCardProps) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [state, formAction, isPending] = useActionState(
    deleteKnowledgeBaseAction,
    {}
  );

  useEffect(() => {
    if (state.success) setConfirmOpen(false);
  }, [state.success]);

  return (
    <>
      <Card
        className="group cursor-pointer transition-colors duration-200 hover:border-primary/40"
        onClick={() => router.push(`/knowledge/${id}`)}
      >
        <CardHeader className="py-4">
          <div className="flex items-start gap-3.5">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/15 transition-transform duration-200 group-hover:-translate-y-0.5">
              <BookOpen className="size-5" strokeWidth={1.75} />
            </span>
            <div className="flex-1 min-w-0">
              <CardTitle className="text-base tracking-tight">{name}</CardTitle>
              {description && (
                <CardDescription className="mt-1">{description}</CardDescription>
              )}
              <p className="mt-2 flex items-center gap-1.5 font-mono text-xs text-muted-foreground tabular-nums">
                <span>{fileCount} 个文件</span>
                <span className="text-border">·</span>
                <span>创建于 {createdAt}</span>
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              className="text-muted-foreground hover:text-destructive shrink-0"
              onClick={(e) => {
                e.stopPropagation();
                setConfirmOpen(true);
              }}
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </CardHeader>
      </Card>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>删除知识库</DialogTitle>
            <DialogDescription>
              确定要删除知识库「{name}」吗？其中的所有文件和向量数据将一并删除，此操作不可撤销。
            </DialogDescription>
          </DialogHeader>
          {state.error && (
            <p className="text-sm text-destructive">{state.error}</p>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmOpen(false)}
              disabled={isPending}
            >
              取消
            </Button>
            <form action={formAction}>
              <input type="hidden" name="id" value={id} />
              <Button variant="destructive" type="submit" disabled={isPending}>
                {isPending ? <Spinner className="size-4" /> : "删除"}
              </Button>
            </form>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
