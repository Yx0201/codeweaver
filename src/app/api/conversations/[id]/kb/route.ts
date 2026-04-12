import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const body = await req.json();
  const knowledgeBaseId = body.knowledgeBaseId ?? null;
  const searchMode = body.searchMode as string | undefined;

  const data: Record<string, unknown> = { updated_at: new Date() };
  if (body.knowledgeBaseId !== undefined) data.knowledge_base_id = knowledgeBaseId;
  if (searchMode) data.search_mode = searchMode;

  try {
    await prisma.conversation.update({
      where: { id },
      data,
    });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "更新失败" }, { status: 500 });
  }
}
