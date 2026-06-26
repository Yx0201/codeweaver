"use server";

import { revalidatePath } from "next/cache";
import { cleanupKnowledgeGraph } from "@/lib/knowledge-graph";
import { prisma } from "@/lib/prisma";
import { deleteBlob, deleteBlobs } from "@/lib/blob";
import { auth } from "@/auth";

export type CreateKnowledgeBaseState = {
  error?: string;
  success?: boolean;
};

async function requireUserId() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  return session.user.id;
}

export async function createKnowledgeBaseFormAction(
  _prevState: CreateKnowledgeBaseState,
  formData: FormData
): Promise<CreateKnowledgeBaseState> {
  const name = (formData.get("name") as string)?.trim();
  const description = (formData.get("description") as string)?.trim();

  if (!name) {
    return { error: "知识库名称不能为空" };
  }

  const userId = await requireUserId();
  try {
    await prisma.knowledge_base.create({
      data: { name, description: description || null, user: { connect: { id: userId } } },
    });
    revalidatePath("/knowledge");
    return { success: true };
  } catch {
    return { error: "创建失败，请重试" };
  }
}

export async function getKnowledgeBases() {
  try {
    const userId = await requireUserId();
    const knowledgeBases = await prisma.knowledge_base.findMany({
      where: { user_id: userId },
      orderBy: {
        created_at: "desc",
      },
      include: {
        _count: {
          select: { uploaded_files: true },
        },
      },
    });

    return { success: true, data: knowledgeBases };
  } catch (error) {
    console.error("Failed to fetch knowledge bases:", error);
    return { success: false, error: "Failed to fetch knowledge bases" };
  }
}

export async function createKnowledgeBase(data: {
  name: string;
  description?: string;
}) {
  try {
    if (!data.name || !data.name.trim()) {
      return { success: false, error: "Knowledge base name is required" };
    }

    const userId = await requireUserId();
    const knowledgeBase = await prisma.knowledge_base.create({
      data: {
        name: data.name.trim(),
        description: data.description?.trim() || null,
        user: { connect: { id: userId } },
      },
    });

    return { success: true, data: knowledgeBase };
  } catch (error) {
    console.error("Failed to create knowledge base:", error);
    return { success: false, error: "Failed to create knowledge base" };
  }
}

export async function deleteKnowledgeBaseAction(
  _prevState: { error?: string; success?: boolean },
  formData: FormData
): Promise<{ error?: string; success?: boolean }> {
  const id = parseInt(formData.get("id") as string);
  if (isNaN(id)) return { error: "无效的知识库 ID" };
  const userId = await requireUserId();
  try {
    // 先取出该 KB 下所有文件的 blob_url,删除 DB 记录后清理 Blob 对象,
    // 避免留下孤儿对象占用存储。where 同时校验 user_id,防止越权删除他人 KB。
    const files = await prisma.uploaded_files.findMany({
      where: { knowledge_base_id: id, knowledge_base: { user_id: userId } },
      select: { blob_url: true },
    });
    await prisma.knowledge_base.delete({ where: { id, user_id: userId } });
    await deleteBlobs(files.map((f) => f.blob_url));
    revalidatePath("/knowledge");
    return { success: true };
  } catch (err) {
    console.error("[deleteKnowledgeBaseAction] id=%d", id, err);
    return { error: "删除失败，请重试" };
  }
}

export async function deleteFileAction(
  _prevState: { error?: string; success?: boolean },
  formData: FormData
): Promise<{ error?: string; success?: boolean }> {
  const id = formData.get("id") as string;
  const knowledgeBaseId = parseInt(formData.get("knowledgeBaseId") as string);
  if (!id) return { error: "无效的文件 ID" };
  const userId = await requireUserId();
  try {
    // 删除 DB 记录前先取出 blob_url,删完 DB 再清理 Blob 对象。
    // where 限定 knowledge_base.user_id,防止越权删除他人文件。
    const file = await prisma.uploaded_files.findFirst({
      where: { id, knowledge_base: { user_id: userId } },
      select: { blob_url: true },
    });
    if (!file) return { error: "文件不存在或无权操作" };
    await prisma.uploaded_files.delete({ where: { id } });
    await deleteBlob(file?.blob_url);
    await cleanupKnowledgeGraph(knowledgeBaseId);
    revalidatePath(`/knowledge/${knowledgeBaseId}`);
    return { success: true };
  } catch {
    return { error: "删除失败，请重试" };
  }
}

export async function getKnowledgeBaseFiles(knowledgeBaseId: number) {
  try {
    if (isNaN(knowledgeBaseId)) {
      return { success: false, error: "Invalid knowledge base ID" };
    }

    const userId = await requireUserId();
    const files = await prisma.uploaded_files.findMany({
      where: {
        knowledge_base_id: knowledgeBaseId,
        knowledge_base: { user_id: userId },
      },
      orderBy: {
        upload_time: "desc",
      },
    });

    return { success: true, data: files };
  } catch (error) {
    console.error("Failed to fetch files:", error);
    return { success: false, error: "Failed to fetch files" };
  }
}
