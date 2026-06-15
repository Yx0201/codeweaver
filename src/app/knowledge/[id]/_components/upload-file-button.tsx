"use client";

import { useRef, useState } from "react";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUploadProgress } from "./upload-progress-context";

interface UploadFileButtonProps {
  knowledgeBaseId: number;
}

export function UploadFileButton({ knowledgeBaseId }: UploadFileButtonProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { openPanel } = useUploadProgress();

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setBusy(true);
    setError(null);

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

      // Hand off to the global progress provider — it owns the panel and
      // the processing loop, so the button is free as soon as upload returns.
      openPanel({
        fileId: data.fileId,
        filename: data.filename ?? file.name,
        status: data.status,
        process: data.process,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "上传失败，请重试");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
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
        {busy ? "上传中..." : "上传文件"}
      </Button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  );
}
