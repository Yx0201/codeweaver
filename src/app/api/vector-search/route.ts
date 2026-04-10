import { hybridSearch } from "@/lib/hybrid-search";

interface VectorSearchRequest {
  query: string;
  knowledgeBaseId: number;
  topK?: number;
  vectorTopK?: number;
  keywordTopK?: number;
  finalTopK?: number;
}

export async function POST(req: Request) {
  const body: VectorSearchRequest = await req.json();
  const {
    query,
    knowledgeBaseId,
    topK,
    vectorTopK,
    keywordTopK,
    finalTopK,
  } = body;

  if (!query || !knowledgeBaseId) {
    return Response.json(
      { error: "query and knowledgeBaseId are required" },
      { status: 400 }
    );
  }

  const results = await hybridSearch(
    query,
    knowledgeBaseId,
    vectorTopK ?? topK ?? 5,
    keywordTopK ?? topK ?? 5,
    finalTopK ?? topK ?? 5
  );

  return Response.json({ results });
}
