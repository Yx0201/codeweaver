-- ============================================================
-- Manual indexes that Prisma cannot manage.
-- Run this script AFTER any `prisma db push` to restore them.
-- Usage: psql -h localhost -U <user> -d knowledge_db -f scripts/ensure-indexes.sql
-- ============================================================

-- 1. Ensure required PostgreSQL extensions exist
-- Note: pgjieba may show a warning if installed via non-default path — safe to ignore
CREATE EXTENSION IF NOT EXISTS vector;
-- CREATE EXTENSION IF NOT EXISTS pgjieba;  -- uncomment if pgjieba is installed via standard path

-- 2. Vector similarity index (hnsw — works on empty tables, better recall)
CREATE INDEX IF NOT EXISTS idx_document_chunks_embedding_hnsw
  ON document_chunks USING hnsw (embedding vector_cosine_ops);

-- 3. GIN index on keywords tsvector column (full-text search)
CREATE INDEX IF NOT EXISTS idx_document_chunks_keywords_gin
  ON document_chunks USING gin (keywords);

-- 4. Knowledge graph: vector similarity index on entity names
CREATE INDEX IF NOT EXISTS idx_kg_entity_name_embedding_hnsw
  ON kg_entity USING hnsw (name_embedding vector_cosine_ops);

-- 5. Knowledge graph: GIN index on entity name keywords
CREATE INDEX IF NOT EXISTS idx_kg_entity_name_keywords_gin
  ON kg_entity USING gin (name_keywords);
