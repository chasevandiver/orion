import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema/index";

type DrizzleDB = ReturnType<typeof drizzle<typeof schema>>;

function createDb(): DrizzleDB {
  const connectionString = process.env.DATABASE_URL;
  if (connectionString) {
    // Real connection — postgres.js is lazy and won't open a socket until the first query.
    const client = postgres(connectionString, {
      max: process.env.NODE_ENV === "production" ? 10 : 2,
      idle_timeout: 20,
      connect_timeout: 10,
    });
    return drizzle(client, {
      schema,
      logger: process.env.NODE_ENV === "development",
    });
  }
  // Build-time placeholder: creates a properly-typed Drizzle instance so that
  // Auth.js's DrizzleAdapter can detect the dialect via symbol checks.
  // postgres.js is lazy — no TCP connection is ever opened with this URL.
  const placeholderClient = postgres("postgresql://build:placeholder@localhost/placeholder");
  return drizzle(placeholderClient, { schema });
}

export const db = createDb();

export type DB = typeof db;

export * from "./schema/index";
