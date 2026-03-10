/**
 * Reset script — wipes all auth-related rows so you can sign up fresh.
 * Truncates in dependency order; CASCADE handles FK children automatically.
 *
 * Run: npm run db:seed:reset
 */

import { db } from "../index.js";
import { sql } from "drizzle-orm";

async function reset() {
  console.log("⚠️  Truncating users, organizations, and all auth rows...");

  // accounts, sessions, verification_tokens reference users;
  // users references organizations — truncate all with CASCADE.
  await db.execute(
    sql`TRUNCATE TABLE
      accounts,
      sessions,
      verification_tokens,
      users,
      organizations
    RESTART IDENTITY CASCADE`
  );

  console.log("✅ Reset complete — sign up fresh with the fixed code.");
  process.exit(0);
}

reset().catch((err) => {
  console.error("Reset failed:", err);
  process.exit(1);
});
