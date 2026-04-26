import { prisma } from "@/lib/prisma";
import { generateEmbedding } from "@/lib/embedding";
import { extractQueryEntities } from "@/lib/graph-extractor";

export interface GraphSearchResult {
  chunk_text: string;
  score: number;
  metadata: unknown;
}

/**
 * Graph-based retrieval: extract entities from query → match in graph → traverse → return chunks.
 *
 * Steps:
 * 1. Extract entity names from the query using LLM
 * 2. Find matching entities in the graph via name similarity (vector + keyword)
 * 3. Traverse 1-2 hops to find related entities and their associated chunks
 * 4. Return chunk texts with graph-based relevance scores
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

  // Step 4: Fetch chunk texts and sort by score
  const chunkIds = [...chunkScores.keys()];
  const rows = await prisma.$queryRawUnsafe<
    { id: string; chunk_text: string; metadata: unknown }[]
  >(
    `SELECT id, chunk_text, metadata FROM graph_chunks WHERE id = ANY($1::uuid[])`,
    chunkIds
  );

  const results: GraphSearchResult[] = rows
    .map((row) => ({
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
 * Uses both vector similarity and keyword matching.
 */
async function findMatchingEntities(
  entityNames: string[],
  knowledgeBaseId: number
): Promise<string[]> {
  const entityIds = new Set<string>();

  for (const name of entityNames) {
    // Keyword match (exact or fuzzy via tsvector)
    const keywordRows = await prisma.$queryRawUnsafe<{ id: string }[]>(
      `SELECT id FROM kg_entity
       WHERE knowledge_base_id = $1
       AND (name ILIKE $2 OR name_keywords @@ plainto_tsquery('jiebacfg', $3))
       LIMIT 5`,
      knowledgeBaseId,
      `%${name}%`,
      name
    );
    for (const row of keywordRows) entityIds.add(row.id);

    // Vector similarity match
    try {
      const embedding = await generateEmbedding(name);
      const vectorStr = `[${embedding.join(",")}]`;
      const vectorRows = await prisma.$queryRawUnsafe<{ id: string }[]>(
        `SELECT id FROM kg_entity
         WHERE knowledge_base_id = $1 AND name_embedding IS NOT NULL
         ORDER BY name_embedding <=> $2::vector
         LIMIT 5`,
        knowledgeBaseId,
        vectorStr
      );
      for (const row of vectorRows) entityIds.add(row.id);
    } catch {
      // Vector search may fail if no embeddings exist yet
    }
  }

  return [...entityIds];
}

/**
 * Traverse the graph from matched entities and collect associated chunk IDs with scores.
 *
 * Scoring:
 * - Direct match (0 hop): score = 1.0
 * - 1-hop neighbor: score = 0.5
 * - 2-hop neighbor: score = 0.25
 */
async function traverseAndGetChunks(
  seedEntityIds: string[],
  knowledgeBaseId: number
): Promise<Map<string, number>> {
  const chunkScores = new Map<string, number>();

  // 0-hop: get chunks directly linked to seed entities
  await addChunksForEntities(seedEntityIds, 1.0, chunkScores);

  // 1-hop: get entities connected via relations
  const oneHopIds = await getRelatedEntities(seedEntityIds, knowledgeBaseId);
  if (oneHopIds.length > 0) {
    await addChunksForEntities(oneHopIds, 0.5, chunkScores);

    // 2-hop
    const twoHopIds = await getRelatedEntities(oneHopIds, knowledgeBaseId);
    if (twoHopIds.length > 0) {
      await addChunksForEntities(twoHopIds, 0.25, chunkScores);
    }
  }

  return chunkScores;
}

async function addChunksForEntities(
  entityIds: string[],
  score: number,
  chunkScores: Map<string, number>
): Promise<void> {
  const rows = await prisma.$queryRawUnsafe<{ chunk_id: string }[]>(
    `SELECT chunk_id FROM kg_entity_chunk WHERE entity_id = ANY($1::uuid[])`,
    entityIds
  );

  for (const row of rows) {
    const existing = chunkScores.get(row.chunk_id) ?? 0;
    chunkScores.set(row.chunk_id, Math.max(existing, score));
  }
}

async function getRelatedEntities(
  entityIds: string[],
  knowledgeBaseId: number
): Promise<string[]> {
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
    if (!entityIds.includes(row.source_entity_id)) {
      relatedIds.add(row.source_entity_id);
    }
    if (!entityIds.includes(row.target_entity_id)) {
      relatedIds.add(row.target_entity_id);
    }
  }

  return [...relatedIds].slice(0, 50); // Limit expansion
}
