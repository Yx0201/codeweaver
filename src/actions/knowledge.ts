"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";

export type CreateKnowledgeBaseState = {
  error?: string;
  success?: boolean;
};

export async function createKnowledgeBaseFormAction(
  _prevState: CreateKnowledgeBaseState,
  formData: FormData
): Promise<CreateKnowledgeBaseState> {
  const name = (formData.get("name") as string)?.trim();
  const description = (formData.get("description") as string)?.trim();

  if (!name) {
    return { error: "知识库名称不能为空" };
  }

  try {
    await prisma.knowledge_base.create({
      data: { name, description: description || null },
    });
    revalidatePath("/knowledge");
    return { success: true };
  } catch {
    return { error: "创建失败，请重试" };
  }
}

export async function getKnowledgeBases() {
  try {
    const knowledgeBases = await prisma.knowledge_base.findMany({
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

    const knowledgeBase = await prisma.knowledge_base.create({
      data: {
        name: data.name.trim(),
        description: data.description?.trim() || null,
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
  try {
    await prisma.knowledge_base.delete({ where: { id } });
    revalidatePath("/knowledge");
    return { success: true };
  } catch {
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
  try {
    await prisma.uploaded_files.delete({ where: { id } });
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

    const files = await prisma.uploaded_files.findMany({
      where: {
        knowledge_base_id: knowledgeBaseId,
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
