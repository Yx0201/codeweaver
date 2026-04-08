import { vectorSearch } from "@/lib/vector-search";

export async function POST(req: Request) {
  const { query, knowledgeBaseId, topK } = await req.json();

  if (!query || !knowledgeBaseId) {
    return Response.json(
      { error: "query and knowledgeBaseId are required" },
      { status: 400 }
    );
  }

  const results = await vectorSearch(query, knowledgeBaseId, topK ?? 5);

  return Response.json({ results });
}
