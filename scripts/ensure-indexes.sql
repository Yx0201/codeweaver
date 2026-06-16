-- ============================================================
-- Manual indexes that Prisma cannot manage.
-- Run this script AFTER any `prisma db push` to restore them.
-- Usage: psql -h localhost -U <user> -d knowledge_db -f scripts/ensure-indexes.sql
--
-- Tokenization note:
--   Chinese segmentation is now done in the application layer (@node-rs/jieba)
--   before tokens reach the database. PostgreSQL stores pre-tokenized text using
--   the 'simple' text search configuration (no stemming, verbatim tokens).
--   This removes the dependency on pgjieba and makes the schema compatible with
--   managed Postgres services such as Neon.
-- ============================================================

-- 1. Required extensions
CREATE EXTENSION IF NOT EXISTS vector;    -- pgvector: semantic search
CREATE EXTENSION IF NOT EXISTS pg_trgm;   -- trigram similarity: fuzzy text matching

-- 2. Vector similarity index on chunk embeddings (HNSW, cosine distance)
CREATE INDEX IF NOT EXISTS idx_document_chunks_embedding_hnsw
  ON document_chunks USING hnsw (embedding vector_cosine_ops);

-- 3. GIN index on keywords tsvector column (full-text search via 'simple' config)
CREATE INDEX IF NOT EXISTS idx_document_chunks_keywords_gin
  ON document_chunks USING gin (keywords);

-- 4. GIN trigram index on raw chunk text (pg_trgm similarity scoring)
--    Used by keyword_search for the similarity() scoring bonus, and as a
--    fallback recall channel for short/exact queries that tsvector may miss.
CREATE INDEX IF NOT EXISTS idx_document_chunks_chunk_text_trgm
  ON document_chunks USING gin (chunk_text gin_trgm_ops);

-- 5. Knowledge graph: vector similarity index on entity names
CREATE INDEX IF NOT EXISTS idx_kg_entity_name_embedding_hnsw
  ON kg_entity USING hnsw (name_embedding vector_cosine_ops);

-- 6. Knowledge graph: GIN index on entity name_keywords tsvector
CREATE INDEX IF NOT EXISTS idx_kg_entity_name_keywords_gin
  ON kg_entity USING gin (name_keywords);

-- 7. Knowledge graph: GIN trigram index on entity names (fuzzy entity matching)
--    Used by graph_search.findMatchingEntities for similarity(e.name, q.name).
CREATE INDEX IF NOT EXISTS idx_kg_entity_name_trgm
  ON kg_entity USING gin (name gin_trgm_ops);

-- 8. Knowledge graph: composite unique index used by entity deduplication
--    (resolveEntityId looks up knowledge_base_id + entity_type + lower(name);
--     UNIQUE also guards against duplicate entities under concurrent ingestion)
CREATE UNIQUE INDEX IF NOT EXISTS idx_kg_entity_kbid_type_lower_name
  ON kg_entity (knowledge_base_id, entity_type, lower(name));
