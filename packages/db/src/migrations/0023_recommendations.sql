-- Recommendation type and status enums
CREATE TYPE recommendation_type AS ENUM (
  'content_gap',
  'performance_drop',
  'stale_campaign',
  'top_performer',
  'audience_growth'
);

CREATE TYPE recommendation_status AS ENUM (
  'pending',
  'acted',
  'dismissed'
);

CREATE TYPE recommendation_action_type AS ENUM (
  'create_campaign',
  'repurpose',
  'adjust_schedule',
  'review_content'
);

-- Recommendations table
CREATE TABLE recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  type recommendation_type NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  action_type recommendation_action_type NOT NULL,
  action_payload JSONB NOT NULL DEFAULT '{}',
  priority INTEGER NOT NULL DEFAULT 3 CHECK (priority >= 1 AND priority <= 5),
  status recommendation_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '3 days')
);

CREATE INDEX recommendations_org_idx ON recommendations(org_id);
CREATE INDEX recommendations_org_active_idx ON recommendations(org_id, status, expires_at);
