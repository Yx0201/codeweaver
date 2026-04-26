"use client";

import { useState, useRef } from "react";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useRouter } from "next/navigation";

interface UploadProgress {
  totalSteps: number;
  completedSteps: number;
  filename: string;
}

interface UploadFileButtonProps {
  knowledgeBaseId: number;
}

type StreamEvent =
  | { type: "start"; totalChunks: number }
  | { type: "progress"; completedChunks: number; totalChunks: number }
  | { type: "complete"; fileId: string; totalChunks: number }
  | { type: "error"; error: string };

export function UploadFileButton({ knowledgeBaseId }: UploadFileButtonProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError(null);
    setProgress(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch(`/api/knowledge/${knowledgeBaseId}/upload`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({ error: "上传失败" }));
        setError(data.error ?? "上传失败");
        return;
      }

      // Read NDJSON stream for progress updates
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const event = JSON.parse(line) as StreamEvent;

            if (event.type === "start") {
              setProgress({
                totalSteps: event.totalChunks,
                completedSteps: 0,
                filename: file.name,
              });
            } else if (event.type === "progress") {
              setProgress((prev) =>
                prev
                  ? { ...prev, completedSteps: event.completedChunks }
                  : null
              );
            } else if (event.type === "complete") {
              setProgress((prev) =>
                prev
                  ? { ...prev, completedSteps: event.totalChunks }
                  : null
              );
            } else if (event.type === "error") {
              setError(event.error);
            }
          } catch {
            // Skip malformed JSON lines
          }
        }
      }

      router.refresh();
    } catch {
      setError("上传失败，请重试");
    } finally {
      setUploading(false);
      setTimeout(() => setProgress(null), 1500);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const percent = progress
    ? Math.round((progress.completedSteps / progress.totalSteps) * 100)
    : 0;

  return (
    <div className="flex flex-col gap-2 items-end">
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          accept=".txt,.md,.markdown"
          className="hidden"
          onChange={handleUpload}
          disabled={uploading}
        />
        <Button
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          size="sm"
        >
          <Upload data-icon="inline-start" className="size-4" />
          上传文件
        </Button>
      </div>

      {progress && (
        <div className="w-64 flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="truncate max-w-[160px]">{progress.filename}</span>
            <span>
              {progress.completedSteps}/{progress.totalSteps} 步骤
            </span>
          </div>
          <Progress value={percent} className="h-2" />
          <span className="text-xs text-muted-foreground text-right">
            {percent}%
          </span>
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
