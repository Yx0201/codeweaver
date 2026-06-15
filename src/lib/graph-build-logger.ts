import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";

/**
 * Structured JSONL logger for the graph-build pipeline.
 *
 * One file per uploaded file: logs/graph-build/<fileId>.jsonl
 * Every event carries a timestamp; durations are in milliseconds.
 *
 * Event types:
 * - batch_start  { concurrency, chunkCount }
 * - chunk_done   { chunkId, ms, entities, relations }
 * - chunk_failed { chunkId, ms, error }
 * - batch_done   { successCount, failCount, ms, rateLimitHits, nextConcurrency, remaining }
 * - build_done   { totalChunks, success, failed, failRate, totalExtractMs, wallClockMs }
 */

const LOG_DIR = path.join(process.cwd(), "logs", "graph-build");

export type GraphBuildLogEvent =
  | {
      event: "batch_start";
      concurrency: number;
      chunkCount: number;
    }
  | {
      event: "chunk_done";
      chunkId: string;
      ms: number;
      entities: number;
      relations: number;
    }
  | {
      event: "chunk_failed";
      chunkId: string;
      ms: number;
      error: string;
    }
  | {
      event: "batch_done";
      successCount: number;
      failCount: number;
      ms: number;
      rateLimitHits: number;
      nextConcurrency: number;
      remaining: number;
    }
  | {
      event: "build_done";
      totalChunks: number;
      success: number;
      failed: number;
      failRate: number;
      totalExtractMs: number;
      wallClockMs: number;
    };

export async function logGraphBuild(
  fileId: string,
  event: GraphBuildLogEvent
): Promise<void> {
  const record = { ts: new Date().toISOString(), fileId, ...event };

  // Console first — survives even if the file write fails.
  console.log(`[graph-build] ${JSON.stringify(record)}`);

  try {
    await mkdir(LOG_DIR, { recursive: true });
    await appendFile(
      path.join(LOG_DIR, `${fileId}.jsonl`),
      JSON.stringify(record) + "\n",
      "utf-8"
    );
  } catch (error) {
    console.error("Failed to write graph-build log:", error);
  }
}
