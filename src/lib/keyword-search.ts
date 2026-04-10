import { prisma } from "@/lib/prisma";

export interface KeywordSearchResult {
  chunk_text: string;
  rank: number;
  metadata: unknown;
}

/**
 * Keyword search using pgjieba tsvector + GIN index with BM25-style ranking.
 *
 * Both indexing (tsvector) and querying (tsquery) are handled by pgjieba
 * to ensure tokenization consistency — the same tokenizer produces
 * the same tokens for both storage and retrieval.
 *
 * Flow:
 *   1. User query is passed directly to plainto_tsquery('jiebacfg', query)
 *   2. pgjieba tokenizes the query with the same dictionary used for indexing
 *   3. ts_rank_cd provides BM25-style ranking
 *   4. Returns Top-K results
 */
export async function keywordSearch(
  query: string,
  knowledgeBaseId: number,
  topK: number = 5
): Promise<KeywordSearchResult[]> {
  const results = await prisma.$queryRawUnsafe<KeywordSearchResult[]>(
    `SELECT dc.chunk_text, dc.metadata,
            ts_rank_cd(dc.keywords, plainto_tsquery('jiebacfg', $1)) as rank
     FROM document_chunks dc
     JOIN uploaded_files uf ON dc.file_id = uf.id
     WHERE uf.knowledge_base_id = $2
       AND dc.keywords @@ plainto_tsquery('jiebacfg', $1)
     ORDER BY rank DESC
     LIMIT $3`,
    query,
    knowledgeBaseId,
    topK
  );

  return results;
}
