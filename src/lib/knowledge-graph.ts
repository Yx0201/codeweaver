import { prisma } from "@/lib/prisma";
import {
  extractEntitiesAndRelations,
  type ExtractedEntity,
  type ExtractedRelation,
} from "@/lib/graph-extractor";
import { generateEmbeddings } from "@/lib/embedding";
import { ENTITY_MERGE_SIMILARITY } from "@/lib/config";
import { toTsvectorInput } from "@/lib/tokenizer";

const MAX_GRAPH_NODES = 80;
const MAX_GRAPH_EDGES = 160;

export interface KnowledgeGraphNode {
  id: string;
  name: string;
  entityType: string;
  description: string | null;
  supportCount: number;
}

export interface KnowledgeGraphEdge {
  id: string;
  source: string;
  target: string;
  relation: string;
  description: string | null;
  occurrenceCount: number;
}

export interface KnowledgeGraphData {
  nodes: KnowledgeGraphNode[];
  edges: KnowledgeGraphEdge[];
  summary: {
    entityCount: number;
    relationCount: number;
    chunkCount: number;
    fileCount: number;
  };
}

export interface KnowledgeGraphChunkIngestion {
  entities: ExtractedEntity[];
  relations: ExtractedRelation[];
}

function normalizeName(name: string): string {
  return name.replace(/\s+/g, " ").trim();
}

/**
 * Normalize relation names so semantically identical relations collapse:
 * collapse whitespace, strip wrapping quotes/punctuation, and cap length.
 */
function normalizeRelationName(name: string): string {
  return name
    .replace(/\s+/g, " ")
    .replace(/^[\s"'“”‘’《》【】()（）.,，。;；:：!！?？-]+/, "")
    .replace(/[\s"'“”‘’《》【】()（）.,，。;；:：!！?？-]+$/, "")
    .trim()
    .slice(0, 30);
}

function dedupeEntities(entities: ExtractedEntity[]): ExtractedEntity[] {
  const entityMap = new Map<string, ExtractedEntity>();

  for (const entity of entities) {
    const normalizedName = normalizeName(entity.name);
    if (!normalizedName) continue;

    const key = `${entity.entity_type}:${normalizedName.toLowerCase()}`;
    const existing = entityMap.get(key);
    if (!existing || (!existing.description && entity.description)) {
      entityMap.set(key, {
        ...entity,
        name: normalizedName,
      });
    }
  }

  return [...entityMap.values()];
}

function dedupeRelations(relations: ExtractedRelation[]): ExtractedRelation[] {
  const relationMap = new Map<string, ExtractedRelation>();

  for (const relation of relations) {
    const source = normalizeName(relation.source);
    const target = normalizeName(relation.target);
    const relationName = normalizeRelationName(relation.relation);
    if (!source || !target || !relationName) continue;

    const key = `${source.toLowerCase()}|${relationName.toLowerCase()}|${target.toLowerCase()}`;
    const existing = relationMap.get(key);
    if (!existing || (!existing.description && relation.description)) {
      relationMap.set(key, {
        ...relation,
        source,
        target,
        relation: relationName,
      });
    }
  }

  return [...relationMap.values()];
}

/**
 * Batch-resolve entities to kg_entity ids.
 *
 * Compresses what used to be N×~4 round-trips (per entity: exact-match SELECT
 * + embedding API + similarity SELECT + create) into ~5 round-trips total for
 * the whole batch, regardless of entity count. On a remote database this is
 * the difference between seconds and minutes per chunk.
 *
 * Stages (all batched):
 *  1. One embedding API call for all names.
 *  2. One SELECT for exact-name OR alias matches (any input name).
 *  3. One vector-similarity SELECT (unnest + LATERAL) for the unresolved ones.
 *  4. Concurrent alias merges for similarity hits (few).
 *  5. One multi-row INSERT for genuinely new entities + one batch UPDATE for
 *     their embeddings/keywords.
 *
 * Returns a map of `lowercase(name) -> entityId` covering every input entity
 * that resolved (matched, merged, or created).
 */
async function resolveEntityIds(
  knowledgeBaseId: number,
  entities: ExtractedEntity[]
): Promise<Map<string, string>> {
  const idMap = new Map<string, string>();

  const items = entities
    .map((e) => ({
      name: normalizeName(e.name),
      type: e.entity_type,
      desc: e.description ?? null,
    }))
    .filter((it) => it.name);
  if (items.length === 0) return idMap;

  const lowerNames = items.map((it) => it.name.toLowerCase());
  const lowerNameSet = new Set(lowerNames);

  // Step 1: batch-embed all names (1 HTTP call instead of N).
  const embeddings = await generateEmbeddings(items.map((it) => it.name));

  // Step 2: batch exact-name / alias match (1 round-trip).
  const exactRows = await prisma.$queryRawUnsafe<
    {
      id: string;
      name: string;
      description: string | null;
      aliases: string[] | null;
    }[]
  >(
    `SELECT id, name, description,
            (SELECT array_agg(a) FROM jsonb_array_elements_text(COALESCE(metadata->'aliases','[]'::jsonb)) a) AS aliases
     FROM kg_entity
     WHERE knowledge_base_id = $1
       AND (
         lower(name) = ANY($2::text[])
         OR EXISTS (
           SELECT 1 FROM jsonb_array_elements_text(COALESCE(metadata->'aliases','[]'::jsonb)) a
           WHERE lower(a) = ANY($2::text[])
         )
       )`,
    knowledgeBaseId,
    lowerNames
  );

  // Map each matched canonical name / alias back to its entity id.
  const descBackfill: { id: string; desc: string }[] = [];
  for (const row of exactRows) {
    const ln = row.name.toLowerCase();
    if (lowerNameSet.has(ln)) {
      idMap.set(ln, row.id);
      if (!row.description) {
        const item = items.find((it) => it.name.toLowerCase() === ln);
        if (item?.desc) descBackfill.push({ id: row.id, desc: item.desc });
      }
    }
    for (const alias of row.aliases ?? []) {
      const al = alias.toLowerCase();
      if (lowerNameSet.has(al)) idMap.set(al, row.id);
    }
  }

  // Batch backfill missing descriptions on exact-matched entities.
  if (descBackfill.length > 0) {
    const vals = descBackfill
      .map((_, i) => `($${i * 2 + 1}::uuid, $${i * 2 + 2})`)
      .join(", ");
    const params = descBackfill.flatMap((d) => [d.id, d.desc]);
    await prisma.$executeRawUnsafe(
      `UPDATE kg_entity AS e
       SET description = v.descr
       FROM (VALUES ${vals}) AS v(id, descr)
       WHERE e.id = v.id AND e.description IS NULL`,
      ...params
    );
  }

  // Collect entities still unresolved (no exact/alias match).
  const unresolvedIdx: number[] = [];
  const unresolvedTypes: string[] = [];
  const unresolvedVectors: string[] = [];
  items.forEach((it, i) => {
    if (!idMap.has(it.name.toLowerCase())) {
      unresolvedIdx.push(i);
      unresolvedTypes.push(it.type);
      unresolvedVectors.push(`[${embeddings[i].join(",")}]`);
    }
  });

  if (unresolvedIdx.length === 0) return idMap;

  // Step 3: batch vector-similarity match for unresolved entities (1 round-trip).
  const simRows = await prisma.$queryRawUnsafe<
    { idx: number; id: string; name: string; sim: number }[]
  >(
    `SELECT q.idx, e.id, e.name, 1 - (e.name_embedding <=> q.emb) AS sim
     FROM unnest($1::int[], $2::text[], $3::vector[]) AS q(idx, etype, emb)
     CROSS JOIN LATERAL (
       SELECT id, name, name_embedding
       FROM kg_entity
       WHERE knowledge_base_id = $4
         AND entity_type = q.etype
         AND name_embedding IS NOT NULL
       ORDER BY name_embedding <=> q.emb
       LIMIT 1
     ) e`,
    unresolvedIdx,
    unresolvedTypes,
    unresolvedVectors,
    knowledgeBaseId
  );

  const simByOrigIdx = new Map<number, { id: string; name: string; sim: number }>();
  for (const r of simRows) simByOrigIdx.set(r.idx, { id: r.id, name: r.name, sim: r.sim });

  const toMerge: { entityId: string; canonicalName: string; alias: string }[] = [];
  const toCreate: { name: string; type: string; vector: string }[] = [];

  unresolvedIdx.forEach((origIdx, pos) => {
    const item = items[origIdx];
    const match = simByOrigIdx.get(origIdx);
    if (match && match.sim >= ENTITY_MERGE_SIMILARITY) {
      idMap.set(item.name.toLowerCase(), match.id);
      toMerge.push({ entityId: match.id, canonicalName: match.name, alias: item.name });
    } else {
      toCreate.push({ name: item.name, type: item.type, vector: unresolvedVectors[pos] });
    }
  });

  // Step 4: concurrent alias merges (few of these; different entity ids → safe).
  if (toMerge.length > 0) {
    await Promise.all(
      toMerge.map((m) => addEntityAlias(m.entityId, m.canonicalName, m.alias))
    );
  }

  // Step 5: batch-create genuinely new entities, then batch-backfill embeddings.
  if (toCreate.length > 0) {
    const insVals = toCreate
      .map((_, i) => `($${i * 3 + 1}, $${i * 3 + 2}, $${i * 3 + 3})`)
      .join(", ");
    const insParams = toCreate.flatMap((c) => [knowledgeBaseId, c.name, c.type]);
    const created = await prisma.$queryRawUnsafe<{ id: string; name: string }[]>(
      `INSERT INTO kg_entity (knowledge_base_id, name, entity_type)
       VALUES ${insVals}
       RETURNING id, name`,
      ...insParams
    );

    created.forEach((row) => idMap.set(row.name.toLowerCase(), row.id));

    const upVals = created
      .map((_, i) => `($${i * 3 + 1}::uuid, $${i * 3 + 2}::vector, $${i * 3 + 3})`)
      .join(", ");
    const upParams: unknown[] = [];
    created.forEach((row, i) => {
      upParams.push(row.id, toCreate[i].vector, toTsvectorInput(toCreate[i].name));
    });
    await prisma.$executeRawUnsafe(
      `UPDATE kg_entity AS e
       SET name_embedding = v.emb,
           name_keywords = to_tsvector('simple', v.kw)
       FROM (VALUES ${upVals}) AS v(id, emb, kw)
       WHERE e.id = v.id`,
      ...upParams
    );
  }

  return idMap;
}

/**
 * Record an alias on an existing entity and refresh name_keywords so the
 * alias is matchable by keyword/graph entity lookups.
 */
async function addEntityAlias(
  entityId: string,
  canonicalName: string,
  alias: string
): Promise<void> {
  try {
    // Fetch existing aliases so we can rebuild name_keywords to include them all.
    const rows = await prisma.$queryRawUnsafe<{ metadata: unknown }[]>(
      `SELECT metadata FROM kg_entity WHERE id = $1::uuid LIMIT 1`,
      entityId
    );
    const meta = rows[0]?.metadata as Record<string, unknown> | null;
    const existingAliases = Array.isArray(meta?.aliases)
      ? (meta.aliases as string[])
      : [];

    // Pre-tokenize every name (canonical + new alias + prior aliases) and join.
    // Passing space-joined token strings to to_tsvector('simple', ...) stores
    // each token verbatim — no extra stemming needed.
    const allNames = [canonicalName, alias, ...existingAliases];
    const tokenizedAll = allNames.map((n) => toTsvectorInput(n)).join(" ");

    await prisma.$executeRawUnsafe(
      `UPDATE kg_entity
       SET metadata = jsonb_set(
             COALESCE(metadata, '{}'::jsonb),
             '{aliases}',
             (
               SELECT jsonb_agg(DISTINCT v)
               FROM jsonb_array_elements_text(
                 COALESCE(metadata -> 'aliases', '[]'::jsonb) || to_jsonb(ARRAY[$2::text])
               ) v
             )
           ),
           name_keywords = to_tsvector('simple', $3)
       WHERE id = $1::uuid`,
      entityId,
      alias,
      tokenizedAll
    );
  } catch (error) {
    console.error("Failed to record entity alias:", error);
  }
}

export async function ingestKnowledgeGraphChunk(params: {
  knowledgeBaseId: number;
  graphChunkId: string;
  chunkText: string;
}): Promise<void> {
  const { knowledgeBaseId, graphChunkId, chunkText } = params;
  const extraction = await prepareKnowledgeGraphChunkIngestion(chunkText);

  await writeKnowledgeGraphChunkIngestion({
    knowledgeBaseId,
    graphChunkId,
    extraction,
  });
}

export async function prepareKnowledgeGraphChunkIngestion(
  chunkText: string
): Promise<KnowledgeGraphChunkIngestion> {
  const extraction = await extractEntitiesAndRelations(chunkText);

  return {
    entities: dedupeEntities(extraction.entities),
    relations: dedupeRelations(extraction.relations),
  };
}

export async function writeKnowledgeGraphChunkIngestion(params: {
  knowledgeBaseId: number;
  graphChunkId: string;
  extraction: KnowledgeGraphChunkIngestion;
}): Promise<void> {
  const { knowledgeBaseId, graphChunkId, extraction } = params;
  const { entities, relations } = extraction;

  if (entities.length === 0 && relations.length === 0) {
    return;
  }

  // Resolve all entities in one batched pass (see resolveEntityIds).
  const idMap = await resolveEntityIds(knowledgeBaseId, entities);

  // Batch-insert entity↔chunk links (1 round-trip, ON CONFLICT dedupes).
  const seenPairs = new Set<string>();
  const pairs: string[] = [];
  for (const entity of entities) {
    const entityId = idMap.get(normalizeName(entity.name).toLowerCase());
    if (!entityId) continue;
    const key = `${entityId}|${graphChunkId}`;
    if (seenPairs.has(key)) continue;
    seenPairs.add(key);
    pairs.push(entityId);
  }
  if (pairs.length > 0) {
    const vals = pairs
      .map((_, i) => `($${i * 2 + 1}::uuid, $${i * 2 + 2}::uuid)`)
      .join(", ");
    const params = pairs.flatMap((id) => [id, graphChunkId]);
    await prisma.$executeRawUnsafe(
      `INSERT INTO kg_entity_chunk (entity_id, chunk_id)
       VALUES ${vals}
       ON CONFLICT (entity_id, chunk_id) DO NOTHING`,
      ...params
    );
  }

  // Batch-insert relations: one dedup SELECT for this chunk + one multi-row INSERT.
  const relSeen = new Set<string>();
  const rels = relations
    .map((r) => ({
      source: idMap.get(normalizeName(r.source).toLowerCase()),
      target: idMap.get(normalizeName(r.target).toLowerCase()),
      type: normalizeRelationName(r.relation),
    }))
    .filter((r) => r.source && r.target && r.type) as {
    source: string;
    target: string;
    type: string;
  }[];

  // Dedupe within the chunk.
  const uniqueRels = rels.filter((r) => {
    const k = `${r.source}|${r.target}|${r.type}`;
    if (relSeen.has(k)) return false;
    relSeen.add(k);
    return true;
  });

  if (uniqueRels.length === 0) return;

  const existing = await prisma.$queryRawUnsafe<
    { s: string; t: string; rt: string }[]
  >(
    `SELECT source_entity_id AS s, target_entity_id AS t, relation_type AS rt
     FROM kg_relation
     WHERE knowledge_base_id = $1 AND metadata ->> 'chunk_id' = $2`,
    knowledgeBaseId,
    graphChunkId
  );
  const existSet = new Set(existing.map((e) => `${e.s}|${e.t}|${e.rt}`));
  const toInsert = uniqueRels.filter(
    (r) => !existSet.has(`${r.source}|${r.target}|${r.type}`)
  );

  if (toInsert.length > 0) {
    const vals = toInsert
      .map((_, i) => {
        const b = i * 5;
        return `($${b + 1}, $${b + 2}::uuid, $${b + 3}::uuid, $${b + 4}, $${b + 5}::jsonb)`;
      })
      .join(", ");
    const params = toInsert.flatMap((r) => [
      knowledgeBaseId,
      r.source,
      r.target,
      r.type,
      JSON.stringify({ chunk_id: graphChunkId }),
    ]);
    await prisma.$executeRawUnsafe(
      `INSERT INTO kg_relation (knowledge_base_id, source_entity_id, target_entity_id, relation_type, metadata)
       VALUES ${vals}`,
      ...params
    );
  }
}

export async function cleanupKnowledgeGraph(knowledgeBaseId: number): Promise<void> {
  await prisma.$executeRawUnsafe(
    `DELETE FROM kg_relation r
     WHERE r.knowledge_base_id = $1
       AND (
         (r.metadata ->> 'chunk_id') IS NULL
         OR NOT EXISTS (
           SELECT 1
           FROM graph_chunks gc
           JOIN uploaded_files uf ON uf.id = gc.file_id
           WHERE gc.id = (r.metadata ->> 'chunk_id')::uuid
             AND uf.knowledge_base_id = $1
         )
       )`,
    knowledgeBaseId
  );

  await prisma.$executeRawUnsafe(
    `DELETE FROM kg_entity e
     WHERE e.knowledge_base_id = $1
       AND NOT EXISTS (
         SELECT 1
         FROM kg_entity_chunk ec
         JOIN graph_chunks gc ON gc.id = ec.chunk_id
         JOIN uploaded_files uf ON uf.id = gc.file_id
         WHERE ec.entity_id = e.id
           AND uf.knowledge_base_id = $1
       )`,
    knowledgeBaseId
  );
}

export async function getKnowledgeGraphData(
  knowledgeBaseId: number
): Promise<KnowledgeGraphData> {
  const [summaryRows, nodeRows] = await Promise.all([
    prisma.$queryRawUnsafe<
      { entity_count: number; relation_count: number; chunk_count: number; file_count: number }[]
    >(
      `WITH visible_entities AS (
         SELECT DISTINCT e.id
         FROM kg_entity e
         JOIN kg_entity_chunk ec ON ec.entity_id = e.id
         JOIN graph_chunks gc ON gc.id = ec.chunk_id
         JOIN uploaded_files uf ON uf.id = gc.file_id
         WHERE e.knowledge_base_id = $1
           AND uf.knowledge_base_id = $1
       ),
       visible_relations AS (
         SELECT DISTINCT r.id
         FROM kg_relation r
         JOIN graph_chunks gc ON gc.id = (r.metadata ->> 'chunk_id')::uuid
         JOIN uploaded_files uf ON uf.id = gc.file_id
         WHERE r.knowledge_base_id = $1
           AND (r.metadata ->> 'chunk_id') IS NOT NULL
           AND uf.knowledge_base_id = $1
           AND r.source_entity_id IN (SELECT id FROM visible_entities)
           AND r.target_entity_id IN (SELECT id FROM visible_entities)
       )
       SELECT
         (SELECT COUNT(*)::int FROM visible_entities) AS entity_count,
         (SELECT COUNT(*)::int FROM visible_relations) AS relation_count,
         (
           SELECT COUNT(*)::int
           FROM graph_chunks gc
           JOIN uploaded_files uf ON uf.id = gc.file_id
           WHERE uf.knowledge_base_id = $1
         ) AS chunk_count,
         (
           SELECT COUNT(*)::int
           FROM uploaded_files
           WHERE knowledge_base_id = $1
         ) AS file_count`,
      knowledgeBaseId
    ),
    prisma.$queryRawUnsafe<
      { id: string; name: string; entity_type: string; description: string | null; support_count: number }[]
    >(
      `SELECT
         e.id,
         e.name,
         e.entity_type,
         e.description,
         COUNT(DISTINCT ec.chunk_id)::int AS support_count
       FROM kg_entity e
       JOIN kg_entity_chunk ec ON ec.entity_id = e.id
       JOIN graph_chunks gc ON gc.id = ec.chunk_id
       JOIN uploaded_files uf ON uf.id = gc.file_id
       WHERE e.knowledge_base_id = $1
         AND uf.knowledge_base_id = $1
       GROUP BY e.id, e.name, e.entity_type, e.description
       ORDER BY support_count DESC, e.name ASC
       LIMIT $2`,
      knowledgeBaseId,
      MAX_GRAPH_NODES
    ),
  ]);

  const nodeIds = nodeRows.map((node) => node.id);

  const edgeRows =
    nodeIds.length === 0
      ? []
      : await prisma.$queryRawUnsafe<
          {
            source_entity_id: string;
            target_entity_id: string;
            relation_type: string;
            description: string | null;
            occurrence_count: number;
          }[]
        >(
          `SELECT
             r.source_entity_id,
             r.target_entity_id,
             r.relation_type,
             MIN(r.description) AS description,
             COUNT(*)::int AS occurrence_count
           FROM kg_relation r
           JOIN graph_chunks gc ON gc.id = (r.metadata ->> 'chunk_id')::uuid
           JOIN uploaded_files uf ON uf.id = gc.file_id
           WHERE r.knowledge_base_id = $1
             AND (r.metadata ->> 'chunk_id') IS NOT NULL
             AND uf.knowledge_base_id = $1
             AND r.source_entity_id = ANY($2::uuid[])
             AND r.target_entity_id = ANY($2::uuid[])
           GROUP BY r.source_entity_id, r.target_entity_id, r.relation_type
           ORDER BY occurrence_count DESC, r.relation_type ASC
           LIMIT $3`,
          knowledgeBaseId,
          nodeIds,
          MAX_GRAPH_EDGES
        );

  return {
    nodes: nodeRows.map((node) => ({
      id: node.id,
      name: node.name,
      entityType: node.entity_type,
      description: node.description,
      supportCount: node.support_count,
    })),
    edges: edgeRows.map((edge) => ({
      id: `${edge.source_entity_id}:${edge.relation_type}:${edge.target_entity_id}`,
      source: edge.source_entity_id,
      target: edge.target_entity_id,
      relation: edge.relation_type,
      description: edge.description,
      occurrenceCount: edge.occurrence_count,
    })),
    summary: {
      entityCount: summaryRows[0]?.entity_count ?? 0,
      relationCount: summaryRows[0]?.relation_count ?? 0,
      chunkCount: summaryRows[0]?.chunk_count ?? 0,
      fileCount: summaryRows[0]?.file_count ?? 0,
    },
  };
}
