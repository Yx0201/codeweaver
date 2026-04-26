-- Bring historical db-push drift under formal migration management
ALTER TABLE "document_chunks"
  ADD COLUMN IF NOT EXISTS "parent_chunk_id" UUID,
  ADD COLUMN IF NOT EXISTS "chunk_type" VARCHAR(20);

CREATE INDEX IF NOT EXISTS "idx_document_chunks_parent_id"
  ON "document_chunks"("parent_chunk_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'document_chunks_parent_chunk_id_fkey'
  ) THEN
    ALTER TABLE "document_chunks"
      ADD CONSTRAINT "document_chunks_parent_chunk_id_fkey"
      FOREIGN KEY ("parent_chunk_id")
      REFERENCES "document_chunks"("id")
      ON DELETE CASCADE
      ON UPDATE NO ACTION;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "graph_chunks" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "file_id" UUID NOT NULL,
  "chunk_text" TEXT NOT NULL,
  "chunk_order" INTEGER,
  "chapter_title" VARCHAR(255),
  "volume_title" VARCHAR(255),
  "metadata" JSONB,
  "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "graph_chunks_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "idx_graph_chunks_file_id"
  ON "graph_chunks"("file_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'graph_chunks_file_id_fkey'
  ) THEN
    ALTER TABLE "graph_chunks"
      ADD CONSTRAINT "graph_chunks_file_id_fkey"
      FOREIGN KEY ("file_id")
      REFERENCES "uploaded_files"("id")
      ON DELETE CASCADE
      ON UPDATE NO ACTION;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "kg_entity" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "knowledge_base_id" INTEGER NOT NULL,
  "name" VARCHAR(500) NOT NULL,
  "entity_type" VARCHAR(50) NOT NULL,
  "description" TEXT,
  "name_embedding" vector(1024),
  "name_keywords" tsvector,
  "metadata" JSONB,
  "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "kg_entity_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "idx_kg_entity_kbid"
  ON "kg_entity"("knowledge_base_id");

CREATE INDEX IF NOT EXISTS "idx_kg_entity_name"
  ON "kg_entity"("name");

CREATE TABLE IF NOT EXISTS "kg_relation" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "knowledge_base_id" INTEGER NOT NULL,
  "source_entity_id" UUID NOT NULL,
  "target_entity_id" UUID NOT NULL,
  "relation_type" VARCHAR(200) NOT NULL,
  "description" TEXT,
  "metadata" JSONB,
  "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "kg_relation_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "idx_kg_relation_kbid"
  ON "kg_relation"("knowledge_base_id");

CREATE INDEX IF NOT EXISTS "idx_kg_relation_source"
  ON "kg_relation"("source_entity_id");

CREATE INDEX IF NOT EXISTS "idx_kg_relation_target"
  ON "kg_relation"("target_entity_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'kg_relation_source_entity_id_fkey'
  ) THEN
    ALTER TABLE "kg_relation"
      ADD CONSTRAINT "kg_relation_source_entity_id_fkey"
      FOREIGN KEY ("source_entity_id")
      REFERENCES "kg_entity"("id")
      ON DELETE CASCADE
      ON UPDATE NO ACTION;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'kg_relation_target_entity_id_fkey'
  ) THEN
    ALTER TABLE "kg_relation"
      ADD CONSTRAINT "kg_relation_target_entity_id_fkey"
      FOREIGN KEY ("target_entity_id")
      REFERENCES "kg_entity"("id")
      ON DELETE CASCADE
      ON UPDATE NO ACTION;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "kg_entity_chunk" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "entity_id" UUID NOT NULL,
  "chunk_id" UUID NOT NULL,
  "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "kg_entity_chunk_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "idx_kg_entity_chunk_unique"
  ON "kg_entity_chunk"("entity_id", "chunk_id");

CREATE INDEX IF NOT EXISTS "idx_kg_ec_entity"
  ON "kg_entity_chunk"("entity_id");

CREATE INDEX IF NOT EXISTS "idx_kg_ec_chunk"
  ON "kg_entity_chunk"("chunk_id");

INSERT INTO "graph_chunks" (
  "id",
  "file_id",
  "chunk_text",
  "chunk_order",
  "metadata",
  "created_at"
)
SELECT
  dc."id",
  dc."file_id",
  dc."chunk_text",
  dc."chunk_order",
  dc."metadata",
  dc."created_at"
FROM "document_chunks" dc
WHERE dc."parent_chunk_id" IS NULL
  AND COALESCE(dc."chunk_type", 'parent') = 'parent'
ON CONFLICT ("id") DO NOTHING;

DELETE FROM "kg_entity_chunk" ec
WHERE NOT EXISTS (
  SELECT 1
  FROM "graph_chunks" gc
  WHERE gc."id" = ec."chunk_id"
);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'kg_entity_chunk_chunk_id_fkey'
  ) THEN
    ALTER TABLE "kg_entity_chunk" DROP CONSTRAINT "kg_entity_chunk_chunk_id_fkey";
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'kg_entity_chunk_entity_id_fkey'
  ) THEN
    ALTER TABLE "kg_entity_chunk" DROP CONSTRAINT "kg_entity_chunk_entity_id_fkey";
  END IF;

  ALTER TABLE "kg_entity_chunk"
    ADD CONSTRAINT "kg_entity_chunk_entity_id_fkey"
    FOREIGN KEY ("entity_id")
    REFERENCES "kg_entity"("id")
    ON DELETE CASCADE
    ON UPDATE NO ACTION;

  ALTER TABLE "kg_entity_chunk"
    ADD CONSTRAINT "kg_entity_chunk_chunk_id_fkey"
    FOREIGN KEY ("chunk_id")
    REFERENCES "graph_chunks"("id")
    ON DELETE CASCADE
    ON UPDATE NO ACTION;
END $$;

DELETE FROM "kg_relation" r
WHERE (r."metadata" ->> 'chunk_id') IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "graph_chunks" gc
    WHERE gc."id" = (r."metadata" ->> 'chunk_id')::uuid
  );

DELETE FROM "kg_entity" e
WHERE NOT EXISTS (
  SELECT 1
  FROM "kg_entity_chunk" ec
  WHERE ec."entity_id" = e."id"
);
