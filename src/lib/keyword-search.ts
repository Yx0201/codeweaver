import { prisma } from "@/lib/prisma";
import { buildAndTsquery, buildOrTsquery } from "@/lib/tokenizer";

export interface KeywordSearchResult {
  chunk_id: string;
  file_id: string;
  filename: string;
  chunk_text: string;
  rank: number;
  metadata: unknown;
}

/**
 * Keyword search using application-layer Jieba tokenization + PostgreSQL
 * 'simple' tsvector + pg_trgm similarity scoring.
 *
 * Tokenization is done in Node.js (via @node-rs/jieba) before hitting the
 * database, removing the dependency on the pgjieba extension. This makes
 * the stack compatible with managed Postgres services (e.g. Neon) that do
 * not support custom C extensions.
 *
 * Pipeline:
 *   1. Tokenize query in app layer → AND/OR tsquery strings
 *   2. tsvector recall:  `dc.keywords @@ to_tsquery('simple', $orQuery)`
 *   3. Scoring blend:
 *        2× ts_rank_cd(AND)  — rewards full-term matches
 *      + 1× ts_rank_cd(OR)   — rewards any-term matches
 *      + 0.2× similarity()   — pg_trgm character-level bonus
 *   4. Returns top-K ranked results
 */
export async function keywordSearch(
  query: string,
  knowledgeBaseId: number,
  topK: number = 5
): Promise<KeywordSearchResult[]> {
  const andQuery = buildAndTsquery(query);
  const orQuery = buildOrTsquery(query);

  // Nothing to search if tokenization produced no tokens.
  if (!orQuery) return [];

  const results = await prisma.$queryRawUnsafe<KeywordSearchResult[]>(
    `SELECT dc.id AS chunk_id,
            dc.file_id,
            uf.filename,
            dc.chunk_text,
            dc.metadata,
            (
              -- AND match: heavily weighted — chunk contains ALL query terms
              CASE WHEN $1 <> '' AND dc.keywords @@ to_tsquery('simple', $1)
                   THEN 2.0 * ts_rank_cd(dc.keywords, to_tsquery('simple', $1), 32)
                   ELSE 0
              END
              -- OR match: soft recall — chunk contains at least one query term
              + ts_rank_cd(dc.keywords, to_tsquery('simple', $2), 32)
              -- pg_trgm bonus: character-level similarity (helps short/exact queries)
              + 0.2 * similarity(dc.chunk_text, $5)
            ) AS rank
     FROM document_chunks dc
     JOIN uploaded_files uf ON dc.file_id = uf.id
     WHERE uf.knowledge_base_id = $3
       AND dc.chunk_type = 'child'
       AND dc.keywords @@ to_tsquery('simple', $2)
     ORDER BY rank DESC
     LIMIT $4`,
    andQuery,        // $1 — AND tsquery (may be same as OR when single token)
    orQuery,         // $2 — OR tsquery used for recall filter + base score
    knowledgeBaseId, // $3
    topK,            // $4
    query            // $5 — original query for pg_trgm similarity()
  );

  return results;
}
