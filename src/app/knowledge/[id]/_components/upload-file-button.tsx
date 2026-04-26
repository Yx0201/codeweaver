"use client";

import { useRef, useState } from "react";
import { CheckCircle2, Clock3, Loader2, Upload, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import type { UploadPipelineState, UploadPipelineStep } from "@/lib/upload-processing";

interface UploadFileButtonProps {
  knowledgeBaseId: number;
}

interface UploadSession {
  fileId: string;
  filename: string;
  status: string;
  process: UploadPipelineState | null;
}

function StepIcon({ step }: { step: UploadPipelineStep }) {
  if (step.status === "completed") {
    return <CheckCircle2 className="size-4 text-green-600" />;
  }
  if (step.status === "failed") {
    return <XCircle className="size-4 text-destructive" />;
  }
  if (step.status === "running") {
    return <Loader2 className="size-4 animate-spin text-primary" />;
  }
  return <Clock3 className="size-4 text-muted-foreground" />;
}

export function UploadFileButton({ knowledgeBaseId }: UploadFileButtonProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<UploadSession | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const processFile = async (fileId: string) => {
    let done = false;

    while (!done) {
      const res = await fetch(
        `/api/knowledge/${knowledgeBaseId}/files/${fileId}/process`,
        { method: "POST" }
      );
      const data = await res.json().catch(() => null);

      if (!res.ok || !data) {
        throw new Error(data?.error ?? "文件处理失败");
      }

      setSession((prev) =>
        prev
          ? {
              ...prev,
              status: data.status,
              process: data.process,
            }
          : {
              fileId,
              filename: data.filename ?? "处理中",
              status: data.status,
              process: data.process,
            }
      );

      if (data.status === "completed") {
        done = true;
        break;
      }

      if (data.status === "failed") {
        throw new Error(data.error ?? "文件处理失败");
      }

      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setBusy(true);
    setError(null);
    setSession(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch(`/api/knowledge/${knowledgeBaseId}/upload`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.fileId) {
        throw new Error(data?.error ?? "上传失败");
      }

      setSession({
        fileId: data.fileId,
        filename: data.filename ?? file.name,
        status: data.status,
        process: data.process,
      });

      router.refresh();
      await processFile(data.fileId);
      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : "上传失败，请重试";
      setError(message);
      setSession((prev) =>
        prev
          ? {
              ...prev,
              status: "failed",
              process: prev.process
                ? { ...prev.process, error: message }
                : null,
            }
          : prev
      );
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const currentStep =
    session?.process?.steps.find((step) => step.status === "running") ??
    session?.process?.steps.find((step) => step.status === "failed") ??
    null;

  return (
    <div className="flex w-full max-w-md flex-col gap-3 items-end">
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          accept=".txt,.md,.markdown"
          className="hidden"
          onChange={handleUpload}
          disabled={busy}
        />
        <Button
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          size="sm"
        >
          <Upload data-icon="inline-start" className="size-4" />
          {busy ? "处理中..." : "上传文件"}
        </Button>
      </div>

      {session?.process && (
        <div className="w-full rounded-2xl border bg-card p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{session.filename}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {session.process.currentStageIndex}/{session.process.totalStages} 步
                {currentStep ? ` · 当前：${currentStep.label}` : ""}
              </p>
            </div>
            <div className="text-right">
              <p className="text-lg font-semibold">{session.process.totalPercent}%</p>
              <p className="text-xs text-muted-foreground">
                {session.status === "completed"
                  ? "全部完成"
                  : session.status === "failed"
                    ? "处理失败"
                    : "后台处理中"}
              </p>
            </div>
          </div>

          <Progress value={session.process.totalPercent} className="mt-3 h-2.5" />

          <div className="mt-4 space-y-3">
            {session.process.steps.map((step) => (
              <div key={step.key} className="space-y-1.5">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <StepIcon step={step} />
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{step.label}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {step.description}
                      </p>
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground">{step.progress}%</span>
                </div>
                <Progress value={step.progress} className="h-1.5" />
              </div>
            ))}
          </div>

          {session.process.error && (
            <p className="mt-3 text-sm text-destructive">{session.process.error}</p>
          )}

          {session.status === "completed" && (
            <p className="mt-3 text-sm text-green-600">
              文件已经处理完成，可以开始检索与对话了。
            </p>
          )}
        </div>
      )}

      {error && !session?.process?.error && (
        <p className="text-sm text-destructive">{error}</p>
      )}
    </div>
  );
}
