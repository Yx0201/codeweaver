import { prisma } from "@/lib/prisma";
import { generateEmbedding } from "@/lib/embedding";

export interface SearchResult {
  chunk_text: string;
  similarity: number;
  metadata: unknown;
}

export async function vectorSearch(
  query: string,
  knowledgeBaseId: number,
  topK: number = 5
): Promise<SearchResult[]> {
  const embedding = await generateEmbedding(query);
  const vectorStr = `[${embedding.join(",")}]`;

  const results = await prisma.$queryRawUnsafe<SearchResult[]>(
    `SELECT dc.chunk_text, dc.metadata,
            1 - (dc.embedding <=> $1::vector) as similarity
     FROM document_chunks dc
     JOIN uploaded_files uf ON dc.file_id = uf.id
     WHERE uf.knowledge_base_id = $2
       AND dc.embedding IS NOT NULL
     ORDER BY dc.embedding <=> $1::vector
     LIMIT $3`,
    vectorStr,
    knowledgeBaseId,
    topK
  );

  return results;
}
