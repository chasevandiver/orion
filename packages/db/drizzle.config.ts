import type { Config } from "drizzle-kit";
import * as dotenv from "dotenv";

// Load env from repo root
dotenv.config({ path: "../../.env.local" });

export default {
  schema: "./src/schema/index.ts",
  out: "./src/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  verbose: true,
  strict: true,
} satisfies Config;
