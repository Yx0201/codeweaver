import { prisma } from "@/lib/prisma";
import {
  extractEntitiesAndRelations,
  type ExtractedEntity,
  type ExtractedRelation,
} from "@/lib/graph-extractor";
import { generateEmbedding } from "@/lib/embedding";

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

function normalizeRelationName(name: string): string {
  return name.replace(/\s+/g, " ").trim();
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

async function resolveEntityId(
  knowledgeBaseId: number,
  entity: ExtractedEntity
): Promise<string | null> {
  const normalizedName = normalizeName(entity.name);
  if (!normalizedName) return null;

  const existing = await prisma.$queryRawUnsafe<{ id: string; description: string | null }[]>(
    `SELECT id, description
     FROM kg_entity
     WHERE knowledge_base_id = $1
       AND entity_type = $2
       AND lower(name) = lower($3)
     LIMIT 1`,
    knowledgeBaseId,
    entity.entity_type,
    normalizedName
  );

  if (existing[0]?.id) {
    if (entity.description && !existing[0].description) {
      await prisma.kg_entity.update({
        where: { id: existing[0].id },
        data: {
          description: entity.description,
        },
      });
    }

    return existing[0].id;
  }

  const created = await prisma.kg_entity.create({
    data: {
      knowledge_base_id: knowledgeBaseId,
      name: normalizedName,
      entity_type: entity.entity_type,
      description: entity.description ?? null,
    },
    select: { id: true },
  });

  try {
    const embedding = await generateEmbedding(normalizedName);
    const vector = `[${embedding.join(",")}]`;
    await prisma.$executeRawUnsafe(
      `UPDATE kg_entity
       SET name_embedding = $2::vector,
           name_keywords = to_tsvector('jiebacfg', $3)
       WHERE id = $1::uuid`,
      created.id,
      vector,
      normalizedName
    );
  } catch (error) {
    console.error("Failed to enrich knowledge graph entity:", error);
  }

  return created.id;
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

  const entityIds = new Map<string, string>();

  for (const entity of entities) {
    const entityId = await resolveEntityId(knowledgeBaseId, entity);
    if (!entityId) continue;

    entityIds.set(normalizeName(entity.name).toLowerCase(), entityId);
    await prisma.kg_entity_chunk.upsert({
      where: {
        entity_id_chunk_id: {
          entity_id: entityId,
          chunk_id: graphChunkId,
        },
      },
      update: {},
      create: {
        entity_id: entityId,
        chunk_id: graphChunkId,
      },
    });
  }

  for (const relation of relations) {
    const sourceId = entityIds.get(normalizeName(relation.source).toLowerCase());
    const targetId = entityIds.get(normalizeName(relation.target).toLowerCase());

    if (!sourceId || !targetId) continue;

    const existingRelation = await prisma.$queryRawUnsafe<{ id: string }[]>(
      `SELECT id
       FROM kg_relation
       WHERE knowledge_base_id = $1
         AND source_entity_id = $2::uuid
         AND target_entity_id = $3::uuid
         AND relation_type = $4
         AND metadata ->> 'chunk_id' = $5
       LIMIT 1`,
      knowledgeBaseId,
      sourceId,
      targetId,
      relation.relation,
      graphChunkId
    );

    if (existingRelation[0]?.id) continue;

    await prisma.kg_relation.create({
      data: {
        knowledge_base_id: knowledgeBaseId,
        source_entity_id: sourceId,
        target_entity_id: targetId,
        relation_type: relation.relation,
        description: relation.description ?? null,
        metadata: {
          chunk_id: graphChunkId,
        },
      },
    });
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
