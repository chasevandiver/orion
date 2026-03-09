import { config } from "dotenv";
import { fileURLToPath } from "url";
import path from "path";

// Use import.meta.url so paths are resolved relative to this file,
// not process.cwd() — CWD is unreliable in Turbo monorepo contexts.
// This file is at apps/api/src/env.ts → root is 3 levels up.
const __filename = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(__filename), "../../../");

config({ path: path.join(root, ".env.local") });
config({ path: path.join(root, ".env") });

console.info(
  `[env] Loaded env from ${path.join(root, ".env.local")} — FAL_KEY ${process.env.FAL_KEY ? "SET" : "MISSING"}`,
);
