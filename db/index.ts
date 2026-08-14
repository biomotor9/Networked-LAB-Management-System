import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const globalDatabase = globalThis as typeof globalThis & {
  atlasSql?: ReturnType<typeof postgres>;
};

function databaseUrl(): string {
  // Next.js imports server modules while building. The fallback is never used
  // for a query during build; deployments provide the real URL at runtime.
  return process.env.DATABASE_URL ?? "postgresql://atlas:atlas@127.0.0.1:5432/atlas";
}

const sql = globalDatabase.atlasSql ?? postgres(databaseUrl(), {
  max: Number(process.env.DATABASE_POOL_SIZE ?? 5),
  idle_timeout: 20,
  connect_timeout: 10,
});

if (process.env.NODE_ENV !== "production") globalDatabase.atlasSql = sql;

export const db = drizzle(sql, { schema });
export { sql };
