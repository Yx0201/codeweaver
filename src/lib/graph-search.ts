import { prisma } from "@/lib/prisma";
import { generateEmbeddings } from "@/lib/embedding";
import { extractQueryEntities } from "@/lib/graph-extractor";
import { GRAPH_ENTITY_MATCH_SIMILARITY } from "@/lib/config";

export interface GraphSearchResult {
  chunk_id: string;
  file_id: string;
  filename: string;
  chunk_text: string;
  score: number;
  metadata: unknown;
}

/**
 * Graph-based retrieval: extract entities from query → match in graph → traverse → return chunks.
 *
 * Steps:
 * 1. Extract entity names from the query using LLM
 * 2. Find matching entities in the graph via name similarity (vector + keyword), batched
 * 3. Traverse 1-2 hops to find related entities and their associated chunks
 * 4. Score chunks additively — a chunk supported by multiple query entities
 *    ranks above a chunk supported by one — and return the top results
 */
export async function graphSearch(
  query: string,
  knowledgeBaseId: number,
  topK: number = 10
): Promise<GraphSearchResult[]> {
  // Step 1: Extract entities from query
  const queryEntities = await extractQueryEntities(query);
  if (queryEntities.length === 0) return [];

  // Step 2: Find matching entities via name similarity
  const matchedEntityIds = await findMatchingEntities(queryEntities, knowledgeBaseId);
  if (matchedEntityIds.length === 0) return [];

  // Step 3: Traverse graph (1-2 hops) to find related chunks
  const chunkScores = await traverseAndGetChunks(matchedEntityIds, knowledgeBaseId);
  if (chunkScores.size === 0) return [];

  // Step 4: Fetch chunk texts (with source file info) and sort by score
  const chunkIds = [...chunkScores.keys()];
  const rows = await prisma.$queryRawUnsafe<
    {
      id: string;
      file_id: string;
      filename: string;
      chunk_text: string;
      metadata: unknown;
    }[]
  >(
    `SELECT gc.id, gc.file_id, uf.filename, gc.chunk_text, gc.metadata
     FROM graph_chunks gc
     JOIN uploaded_files uf ON gc.file_id = uf.id
     WHERE gc.id = ANY($1::uuid[])`,
    chunkIds
  );

  const results: GraphSearchResult[] = rows
    .map((row) => ({
      chunk_id: row.id,
      file_id: row.file_id,
      filename: row.filename,
      chunk_text: row.chunk_text,
      score: chunkScores.get(row.id) ?? 0,
      metadata: row.metadata,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  return results;
}

/**
 * Find entities in the graph that match the query entity names.
 *
 * Uses keyword matching (ILIKE + tsvector, covers aliases via name_keywords)
 * and embedding similarity, all batched: one embedding API call and two SQL
 * queries total, regardless of how many query entities there are.
 */
async function findMatchingEntities(
  entityNames: string[],
  knowledgeBaseId: number
): Promise<string[]> {
  const entityIds = new Set<string>();

  // Keyword match (exact / fuzzy / alias) for all names in one query
  const keywordRows = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `SELECT DISTINCT e.id
     FROM kg_entity e
     JOIN unnest($2::text[]) AS q(name) ON
       e.name ILIKE '%' || q.name || '%'
       OR q.name ILIKE '%' || e.name || '%'
       OR e.name_keywords @@ plainto_tsquery('jiebacfg', q.name)
     WHERE e.knowledge_base_id = $1
     LIMIT $3`,
    knowledgeBaseId,
    entityNames,
    entityNames.length * 5
  );
  for (const row of keywordRows) entityIds.add(row.id);

  // Vector similarity match — batch embed all names, then a single lateral query
  try {
    const embeddings = await generateEmbeddings(entityNames);
    const vectorStrs = embeddings.map((e) => `[${e.join(",")}]`);

    const vectorRows = await prisma.$queryRawUnsafe<{ id: string }[]>(
      `SELECT DISTINCT m.id
       FROM unnest($2::vector(1024)[]) AS q(emb)
       CROSS JOIN LATERAL (
         SELECT e.id
         FROM kg_entity e
         WHERE e.knowledge_base_id = $1
           AND e.name_embedding IS NOT NULL
           AND 1 - (e.name_embedding <=> q.emb) >= $3
         ORDER BY e.name_embedding <=> q.emb
         LIMIT 5
       ) m`,
      knowledgeBaseId,
      vectorStrs,
      GRAPH_ENTITY_MATCH_SIMILARITY
    );
    for (const row of vectorRows) entityIds.add(row.id);
  } catch {
    // Vector search may fail if no embeddings exist yet
  }

  return [...entityIds];
}

/**
 * Traverse the graph from matched entities and collect associated chunk IDs with scores.
 *
 * Scoring (additive — evidence accumulates):
 * - Each directly-matched (0-hop) entity linked to a chunk adds 1.0
 * - Each 1-hop neighbor linked to a chunk adds 0.3
 * - Each 2-hop neighbor linked to a chunk adds 0.1
 *
 * A chunk mentioning two query entities (score 2.0) therefore outranks a
 * chunk mentioning only one (1.0), which outranks pure neighborhood noise.
 */
async function traverseAndGetChunks(
  seedEntityIds: string[],
  knowledgeBaseId: number
): Promise<Map<string, number>> {
  const chunkScores = new Map<string, number>();

  // 0-hop: chunks directly linked to seed entities
  await addChunksForEntities(seedEntityIds, 1.0, chunkScores);

  // 1-hop: entities connected via relations
  const oneHopIds = await getRelatedEntities(seedEntityIds, knowledgeBaseId);
  if (oneHopIds.length > 0) {
    await addChunksForEntities(oneHopIds, 0.3, chunkScores);

    // 2-hop: only expand when the 1-hop neighborhood is small —
    // a large 1-hop set means 2-hop would mostly add noise.
    if (oneHopIds.length <= 15) {
      const twoHopIds = await getRelatedEntities(oneHopIds, knowledgeBaseId);
      if (twoHopIds.length > 0) {
        await addChunksForEntities(twoHopIds, 0.1, chunkScores);
      }
    }
  }

  return chunkScores;
}

async function addChunksForEntities(
  entityIds: string[],
  scorePerEntity: number,
  chunkScores: Map<string, number>
): Promise<void> {
  const rows = await prisma.$queryRawUnsafe<
    { chunk_id: string; entity_count: number }[]
  >(
    `SELECT chunk_id, COUNT(DISTINCT entity_id)::int AS entity_count
     FROM kg_entity_chunk
     WHERE entity_id = ANY($1::uuid[])
     GROUP BY chunk_id`,
    entityIds
  );

  for (const row of rows) {
    const existing = chunkScores.get(row.chunk_id) ?? 0;
    chunkScores.set(row.chunk_id, existing + scorePerEntity * row.entity_count);
  }
}

async function getRelatedEntities(
  entityIds: string[],
  knowledgeBaseId: number
): Promise<string[]> {
  const seedSet = new Set(entityIds);
  const relatedIds = new Set<string>();

  const rows = await prisma.$queryRawUnsafe<
    { source_entity_id: string; target_entity_id: string }[]
  >(
    `SELECT source_entity_id, target_entity_id FROM kg_relation
     WHERE knowledge_base_id = $1
     AND (source_entity_id = ANY($2::uuid[]) OR target_entity_id = ANY($2::uuid[]))`,
    knowledgeBaseId,
    entityIds
  );

  for (const row of rows) {
    if (!seedSet.has(row.source_entity_id)) {
      relatedIds.add(row.source_entity_id);
    }
    if (!seedSet.has(row.target_entity_id)) {
      relatedIds.add(row.target_entity_id);
    }
  }

  return [...relatedIds].slice(0, 30); // Limit expansion
}
