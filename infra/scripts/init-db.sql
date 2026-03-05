-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enable pg_trgm for full-text search on contacts
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Enable pgcrypto for token encryption helpers
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Log setup
DO $$ BEGIN
  RAISE NOTICE 'ORION database initialized with extensions';
END $$;
