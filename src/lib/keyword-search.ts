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
  // Use OR-mode matching: plainto_tsquery generates AND (all terms must match)
  // which is too strict for child chunks (~300 chars). Instead, we let pgjieba
  // tokenize the query, then convert to OR-mode so chunks matching ANY term
  // are returned, ranked by how many terms they match.
  const results = await prisma.$queryRawUnsafe<KeywordSearchResult[]>(
    `SELECT dc.chunk_text, dc.metadata,
            ts_rank_cd(dc.keywords, or_tsquery) as rank
     FROM document_chunks dc
     JOIN uploaded_files uf ON dc.file_id = uf.id
     CROSS JOIN LATERAL (
       -- Tokenize with jieba, then convert AND tokens to OR
       SELECT replace(
         plainto_tsquery('jiebacfg', $1)::text,
         ' & ', ' | '
       )::tsquery as or_tsquery
     ) tq
     WHERE uf.knowledge_base_id = $2
       AND dc.keywords @@ tq.or_tsquery
     ORDER BY rank DESC
     LIMIT $3`,
    query,
    knowledgeBaseId,
    topK
  );

  return results;
}
