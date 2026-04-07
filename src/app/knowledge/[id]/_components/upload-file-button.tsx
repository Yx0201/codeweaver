"use client";

import { useState, useRef } from "react";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useRouter } from "next/navigation";

interface UploadFileButtonProps {
  knowledgeBaseId: number;
}

export function UploadFileButton({ knowledgeBaseId }: UploadFileButtonProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch(`/api/knowledge/${knowledgeBaseId}/upload`, {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "上传失败");
      } else {
        router.refresh();
      }
    } catch {
      setError("上传失败，请重试");
    } finally {
      setUploading(false);
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
        disabled={uploading}
      />
      <Button
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        size="sm"
      >
        {uploading ? <Spinner className="size-4" /> : <Upload data-icon="inline-start" className="size-4" />}
        {uploading ? "处理中..." : "上传文件"}
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
