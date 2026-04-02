-- Media assets table for the brand library
CREATE TABLE IF NOT EXISTS media_assets (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  filename    text NOT NULL,
  url         text NOT NULL,
  mime_type   text NOT NULL,
  size_bytes  integer NOT NULL,
  tags        jsonb DEFAULT '[]',
  alt_text    text,
  width       integer,
  height      integer,
  uploaded_by uuid REFERENCES users(id),
  deleted_at  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS media_assets_org_idx ON media_assets(org_id);
