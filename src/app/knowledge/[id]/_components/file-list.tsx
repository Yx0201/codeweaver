"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
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
import type { UploadPipelineState } from "@/lib/upload-processing";
import { useUploadProgress } from "./upload-progress-context";

interface FileItem {
  id: string;
  filename: string;
  fileSize: string;
  uploadTime: string;
  status: string | null;
  process: UploadPipelineState | null;
}

interface FileListProps {
  files: FileItem[];
  knowledgeBaseId: number;
}

function StatusLabel({
  status,
  process,
}: {
  status: string | null;
  process: UploadPipelineState | null;
}) {
  if (status === "completed")
    return (
      <span className="inline-flex items-center gap-1.5 text-primary">
        <span className="size-1.5 rounded-full bg-primary" />
        已完成
      </span>
    );
  if (status === "processing")
    return (
      <span className="inline-flex items-center gap-1.5 text-[oklch(0.74_0.11_70)]">
        <span className="size-1.5 animate-pulse rounded-full bg-[oklch(0.74_0.11_70)]" />
        {process
          ? `${process.steps.find((step) => step.status === "running")?.label ?? "处理中"} · ${process.totalPercent}%`
          : "处理中"}
      </span>
    );
  if (status === "failed")
    return (
      <span className="inline-flex items-center gap-1.5 text-destructive">
        <span className="size-1.5 rounded-full bg-destructive" />
        {process?.error ? `处理失败 · ${process.error}` : "处理失败"}
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1.5 text-muted-foreground">
      <span className="size-1.5 rounded-full bg-muted-foreground/50" />
      已上传
    </span>
  );
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
    if (!state.success) return;

    const frame = requestAnimationFrame(() => setOpen(false));
    return () => cancelAnimationFrame(frame);
  }, [state.success]);

  return (
    <>
      <Button
        variant="ghost"
        size="icon-sm"
        className="text-muted-foreground hover:text-destructive shrink-0"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
      >
        <Trash2 className="w-4 h-4" />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>删除文件</DialogTitle>
            <DialogDescription>
              确定要删除文件「{file.filename}」吗？相关的向量数据和图谱关联都会一并清理，此操作不可撤销。
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

function FileRow({
  file,
  knowledgeBaseId,
}: {
  file: FileItem;
  knowledgeBaseId: number;
}) {
  const router = useRouter();
  const { openPanel } = useUploadProgress();

  // Processing → show the floating progress panel.
  // Failed (with pipeline state) → also show the panel so the error is visible.
  // Otherwise (completed / uploaded / unknown) → navigate to file preview.
  const isInProgress =
    file.status === "processing" ||
    (file.status === "failed" && file.process !== null);

  const handleClick = () => {
    if (isInProgress) {
      openPanel({
        fileId: file.id,
        filename: file.filename,
        status: file.status ?? "processing",
        process: file.process,
      });
      return;
    }
    router.push(`/knowledge/${knowledgeBaseId}/files/${file.id}`);
  };

  return (
    // The clickable area is the inner <button>, NOT the whole Card. The
    // delete trigger sits as a sibling outside the click target so the dialog
    // open/close, form submit, and Radix focus-return can't accidentally
    // navigate the row to the file preview (which would 404 for a just-deleted
    // file).
    <Card className="group transition-colors duration-200 hover:border-primary/40">
      <CardContent className="flex items-center gap-3 py-3">
        <button
          type="button"
          onClick={handleClick}
          aria-label={
            isInProgress
              ? `查看 ${file.filename} 的处理进度`
              : `打开 ${file.filename}`
          }
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground ring-1 ring-border transition-colors group-hover:text-primary">
            <FileText className="size-4.5" strokeWidth={1.75} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-medium truncate group-hover:underline">
              {file.filename}
            </p>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground tabular-nums">
              <span>{file.fileSize}</span>
              <span className="text-border">·</span>
              <span>{file.uploadTime}</span>
              <span className="text-border">·</span>
              <StatusLabel status={file.status} process={file.process} />
            </p>
          </div>
        </button>
        <DeleteFileDialog file={file} knowledgeBaseId={knowledgeBaseId} />
      </CardContent>
    </Card>
  );
}

export function FileList({ files, knowledgeBaseId }: FileListProps) {
  return (
    <div className="flex flex-col gap-2">
      {files.map((file) => (
        <FileRow
          key={file.id}
          file={file}
          knowledgeBaseId={knowledgeBaseId}
        />
      ))}
    </div>
  );
}
