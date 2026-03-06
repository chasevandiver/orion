-- Migration: 0001_fix_role_enum
-- Adds the missing "member" value to the role enum.
--
-- ALTER TYPE ... ADD VALUE is non-transactional in Postgres (cannot be rolled
-- back inside a transaction block). Drizzle's migrate runner handles this
-- correctly by running it outside a transaction.
--
-- Safe to run on existing data — no existing rows reference "member" yet.

ALTER TYPE "role" ADD VALUE IF NOT EXISTS 'member';
