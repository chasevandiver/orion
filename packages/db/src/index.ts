import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema/index";

type DrizzleDB = ReturnType<typeof drizzle<typeof schema>>;

let _db: DrizzleDB | undefined;

function getDb(): DrizzleDB {
  if (_db) return _db;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL environment variable is required");
  }
  const client = postgres(connectionString, {
    max: process.env.NODE_ENV === "production" ? 10 : 2,
    idle_timeout: 20,
    connect_timeout: 10,
  });
  _db = drizzle(client, {
    schema,
    logger: process.env.NODE_ENV === "development",
  });
  return _db;
}

// Proxy defers connection until first property access — safe to import at build time
export const db = new Proxy({} as DrizzleDB, {
  get(_target, prop) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (getDb() as any)[prop];
  },
});

export type DB = typeof db;

export * from "./schema/index";
