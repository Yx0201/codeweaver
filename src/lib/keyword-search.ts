import { prisma } from "@/lib/prisma";

export interface KeywordSearchResult {
  chunk_id: string;
  file_id: string;
  filename: string;
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
  // Recall with OR-mode (any term matches) so partial matches on short child
  // chunks are not lost, but RANK with a weighted blend that strongly favors
  // chunks matching ALL terms (AND). This keeps recall high while pushing
  // single-stray-term noise to the bottom of the list.
  // ts_rank_cd normalization 32 → rank/(rank+1), bounded to [0,1).
  const results = await prisma.$queryRawUnsafe<KeywordSearchResult[]>(
    `SELECT dc.id AS chunk_id,
            dc.file_id,
            uf.filename,
            dc.chunk_text,
            dc.metadata,
            (CASE WHEN dc.keywords @@ tq.and_tsquery
                  THEN 2.0 * ts_rank_cd(dc.keywords, tq.and_tsquery, 32)
                  ELSE 0 END
             + ts_rank_cd(dc.keywords, tq.or_tsquery, 32)) as rank
     FROM document_chunks dc
     JOIN uploaded_files uf ON dc.file_id = uf.id
     CROSS JOIN LATERAL (
       -- Tokenize with jieba once; derive both AND and OR variants
       SELECT and_tsquery,
              replace(and_tsquery::text, ' & ', ' | ')::tsquery AS or_tsquery
       FROM (SELECT plainto_tsquery('jiebacfg', $1) AS and_tsquery) base
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
