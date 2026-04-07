"use client";

import { useRouter } from "next/navigation";
import { BookOpen } from "lucide-react";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

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

  return (
    <Card
      className="cursor-pointer hover:border-primary transition-colors"
      onClick={() => router.push(`/knowledge/${id}`)}
    >
      <CardHeader className="py-4">
        <div className="flex items-start gap-3">
          <BookOpen className="w-5 h-5 text-muted-foreground mt-0.5" />
          <div className="flex-1 min-w-0">
            <CardTitle className="text-base">{name}</CardTitle>
            {description && (
              <CardDescription className="mt-1">{description}</CardDescription>
            )}
            <p className="text-xs text-muted-foreground mt-2">
              {fileCount} 个文件 · 创建于 {createdAt}
            </p>
          </div>
        </div>
      </CardHeader>
    </Card>
  );
}
