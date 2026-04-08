import { buildRagSystemPrompt } from "@/lib/rag-service";

export async function POST(req: Request) {
  const { contexts } = await req.json();

  if (!contexts || !Array.isArray(contexts) || contexts.length === 0) {
    return Response.json(
      { error: "contexts must be a non-empty array of strings" },
      { status: 400 }
    );
  }

  const systemPrompt = buildRagSystemPrompt(contexts);

  return Response.json({ systemPrompt });
}
