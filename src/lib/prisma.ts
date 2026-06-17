import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { PrismaNeon } from "@prisma/adapter-neon";

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
