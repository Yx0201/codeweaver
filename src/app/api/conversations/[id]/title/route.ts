import { NextRequest, NextResponse } from "next/server";
import { generateText } from "ai";
import model from "@/register/model";
import { prisma } from "@/lib/prisma";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const { userMessage } = await req.json();

  if (!userMessage || !id) {
    return NextResponse.json({ error: "参数无效" }, { status: 400 });
  }

  try {
    const { text } = await generateText({
      model,
      prompt: `请用简短的标题（不超过10个字）概括以下消息的主题，只输出标题本身，不加引号、标点或解释：\n\n${userMessage}`,
    });

    const title = text.trim().replace(/^["'「」【】]+|["'「」【】]+$/g, "").slice(0, 20) || "新对话";

    await prisma.conversation.update({
      where: { id },
      data: { title, updated_at: new Date() },
    });

    return NextResponse.json({ title });
  } catch (error) {
    console.error("Title generation failed:", error);
    return NextResponse.json({ title: "新对话" });
  }
}
