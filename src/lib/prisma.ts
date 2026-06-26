import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { PrismaNeon } from "@prisma/adapter-neon";
import { neonConfig } from "@neondatabase/serverless";
// `ws` ships no types and @types/ws isn't installed; its default export IS the
// WebSocket constructor the Neon serverless driver needs.
// @ts-expect-error untyped module
import ws from "ws";

const connectionString = process.env.DATABASE_URL ?? "";

const globalForPrisma = global as unknown as { prisma: PrismaClient };

/**
 * Pick the adapter by connection target:
 *  - Neon (production / Vercel): use the Neon serverless driver (WebSocket
 *    pool). This avoids PgBouncer transaction-pooling prepared-statement
 *    issues that break multi-statement raw queries (e.g. parent→child chunk
 *    inserts with RETURNING id) under `@prisma/adapter-pg` + a pooled
 *    connection string.
 *  - Local Postgres (dev): use the standard `pg` Pool.
 */
function createPrismaClient() {
  const isNeon = connectionString.includes("neon.tech");
  if (isNeon) {
    // The Neon serverless driver tunnels Postgres over a WebSocket. In a Node
    // runtime (local dev, non-edge server) it otherwise falls back to undici's
    // global `WebSocket`, which surfaces a cold-start connection failure as a
    // raw `ErrorEvent` (not an `Error`). That value bubbles unhandled through
    // Prisma into the RSC stream and crashes the page render. Pointing the
    // driver at the `ws` package (Node's standard WebSocket impl) makes the
    // connection reliable and turns failures into proper errors.
    neonConfig.webSocketConstructor = ws;
  }
  const adapter = isNeon
    ? new PrismaNeon({ connectionString })
    : new PrismaPg(new Pool({ connectionString }));

  return new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["query"] : [],
    adapter,
  });
}

export const prisma = globalForPrisma.prisma || createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export default prisma;
