"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";

export async function createConversation(): Promise<{
  id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
}> {
  const conv = await prisma.conversation.create({ data: {} });
  return {
    id: conv.id,
    title: conv.title,
    created_at: conv.created_at?.toISOString() ?? new Date().toISOString(),
    updated_at: conv.updated_at?.toISOString() ?? new Date().toISOString(),
  };
}

export async function updateConversationTitleAction(
  _prev: { error?: string; success?: boolean },
  formData: FormData
): Promise<{ error?: string; success?: boolean }> {
  const id = formData.get("id") as string;
  const title = (formData.get("title") as string)?.trim();
  if (!id || !title) return { error: "参数无效" };
  try {
    await prisma.conversation.update({
      where: { id },
      data: { title, updated_at: new Date() },
    });
    revalidatePath("/chat");
    return { success: true };
  } catch {
    return { error: "修改失败，请重试" };
  }
}

export async function deleteConversationAction(
  _prev: { error?: string; success?: boolean },
  formData: FormData
): Promise<{ error?: string; success?: boolean }> {
  const id = formData.get("id") as string;
  if (!id) return { error: "参数无效" };
  try {
    await prisma.conversation.delete({ where: { id } });
    revalidatePath("/chat");
    return { success: true };
  } catch {
    return { error: "删除失败，请重试" };
  }
}
