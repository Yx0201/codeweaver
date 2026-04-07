"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { FileText, Trash2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
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
import { deleteFileAction } from "@/actions/knowledge";

interface FileItem {
  id: string;
  filename: string;
  fileSize: string;
  uploadTime: string;
  status: string | null;
}

interface FileListProps {
  files: FileItem[];
  knowledgeBaseId: number;
}

function StatusLabel({ status }: { status: string | null }) {
  if (status === "completed")
    return <span className="text-green-600">已完成</span>;
  if (status === "processing")
    return <span className="text-yellow-600">处理中</span>;
  if (status === "failed")
    return <span className="text-destructive">处理失败</span>;
  return <span className="text-muted-foreground">已上传</span>;
}

function DeleteFileDialog({
  file,
  knowledgeBaseId,
}: {
  file: FileItem;
  knowledgeBaseId: number;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, isPending] = useActionState(deleteFileAction, {});

  useEffect(() => {
    if (state.success) setOpen(false);
  }, [state.success]);

  return (
    <>
      <Button
        variant="ghost"
        size="icon-sm"
        className="text-muted-foreground hover:text-destructive shrink-0"
        onClick={() => setOpen(true)}
      >
        <Trash2 className="w-4 h-4" />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>删除文件</DialogTitle>
            <DialogDescription>
              确定要删除文件「{file.filename}」吗？相关的向量数据将一并删除，此操作不可撤销。
            </DialogDescription>
          </DialogHeader>
          {state.error && (
            <p className="text-sm text-destructive">{state.error}</p>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={isPending}
            >
              取消
            </Button>
            <form action={formAction}>
              <input type="hidden" name="id" value={file.id} />
              <input
                type="hidden"
                name="knowledgeBaseId"
                value={knowledgeBaseId}
              />
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

export function FileList({ files, knowledgeBaseId }: FileListProps) {
  return (
    <div className="flex flex-col gap-2">
      {files.map((file) => (
        <Card key={file.id} className="hover:border-primary transition-colors">
          <CardContent className="flex items-center gap-3 py-3">
            <FileText className="w-5 h-5 text-muted-foreground shrink-0" />
            <Link
              href={`/knowledge/${knowledgeBaseId}/files/${file.id}`}
              className="flex-1 min-w-0"
            >
              <p className="font-medium truncate hover:underline">{file.filename}</p>
              <p className="text-xs text-muted-foreground">
                {file.fileSize} · {file.uploadTime} ·{" "}
                <StatusLabel status={file.status} />
              </p>
            </Link>
            <DeleteFileDialog file={file} knowledgeBaseId={knowledgeBaseId} />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
