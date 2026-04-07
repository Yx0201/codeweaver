"use client";

import { useActionState, useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import {
  createKnowledgeBaseFormAction,
  type CreateKnowledgeBaseState,
} from "@/actions/knowledge";

const initialState: CreateKnowledgeBaseState = {};

export function CreateKnowledgeDialog() {
  const [open, setOpen] = useState(false);
  const [state, formAction, isPending] = useActionState(
    createKnowledgeBaseFormAction,
    initialState
  );

  useEffect(() => {
    if (state.success) {
      setOpen(false);
    }
  }, [state.success]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus data-icon="inline-start" />
          新建知识库
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>新建知识库</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="flex flex-col gap-4 py-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="name">名称</Label>
            <Input
              id="name"
              name="name"
              placeholder="请输入知识库名称"
              required
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="description">描述（可选）</Label>
            <Textarea
              id="description"
              name="description"
              placeholder="请输入知识库描述"
            />
          </div>
          {state.error && (
            <p className="text-sm text-destructive">{state.error}</p>
          )}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              取消
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? <Spinner className="size-4" /> : "创建"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
