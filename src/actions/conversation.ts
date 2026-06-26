"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";

export type SearchMode = "hybrid" | "graph" | "fast";

async function requireUserId() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  return session.user.id;
}

export async function createConversation(
  knowledgeBaseId?: number,
  searchMode: SearchMode = "hybrid"
): Promise<{
  id: string;
  title: string | null;
  search_mode: string;
  created_at: string;
  updated_at: string;
}> {
  const userId = await requireUserId();
  const conv = await prisma.conversation.create({
    data: {
      ...(knowledgeBaseId ? { knowledge_base: { connect: { id: knowledgeBaseId } } } : {}),
      search_mode: searchMode,
      user: { connect: { id: userId } },
    },
  });
  return {
    id: conv.id,
    title: conv.title,
    search_mode: conv.search_mode ?? "hybrid",
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
  const userId = await requireUserId();
  try {
    await prisma.conversation.update({
      where: { id, user_id: userId },
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
  const userId = await requireUserId();
  try {
    await prisma.conversation.delete({ where: { id, user_id: userId } });
    revalidatePath("/chat");
    return { success: true };
  } catch {
    return { error: "删除失败，请重试" };
  }
}
