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
      // `/no_think` disables Qwen3's reasoning mode for this turn. The
      // default title model (qwen3:0.6b) is a reasoning model — without
      // this directive its short output window gets consumed by <think>…
      // reasoning and the actual title never appears (or gets truncated
      // mid-think and leaks into the UI as the title).
      prompt: `请用简短的标题（不超过10个字）概括以下消息的主题，只输出标题本身，不加引号、标点或解释：\n\n${userMessage}\n\n/no_think`,
    });

    const cleaned = text
      // Strip any reasoning blocks the model still emits despite /no_think.
      .replace(/<think>[\s\S]*?<\/think>/gi, "")
      .replace(/<\/?think>/gi, "")
      .trim()
      // Trim wrapping quotes / brackets the model sometimes adds.
      .replace(/^["'「」【】]+|["'「」【】]+$/g, "")
      .trim();

    // Guard against a truncated-mid-think response or empty output —
    // any leftover angle bracket means we have a malformed/partial tag,
    // not a real title.
    const title =
      cleaned.length > 0 && !cleaned.includes("<")
        ? cleaned.slice(0, 20)
        : "新对话";

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
