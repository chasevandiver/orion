-- Migration 0011: invitations table
--
-- Adds member invitation flow: org admins can invite users by email.
-- Tokens expire after 7 days. Accepted invitations link the user to the org.

CREATE TYPE invitation_status AS ENUM ('pending', 'accepted', 'revoked');

CREATE TABLE invitations (
  id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            UUID          NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email             TEXT          NOT NULL,
  role              role          NOT NULL DEFAULT 'viewer',
  token             TEXT          NOT NULL,
  status            invitation_status NOT NULL DEFAULT 'pending',
  invited_by_user_id UUID         REFERENCES users(id) ON DELETE SET NULL,
  expires_at        TIMESTAMPTZ   NOT NULL,
  accepted_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX invitations_token_idx     ON invitations (token);
CREATE        INDEX invitations_org_email_idx ON invitations (org_id, email);
CREATE        INDEX invitations_org_status_idx ON invitations (org_id, status);
