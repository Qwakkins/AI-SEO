-- Link Clerk users to businesses they can access
CREATE TABLE user_business_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clerk_user_id text NOT NULL,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'viewer'
    CHECK (role IN ('admin', 'editor', 'viewer')),
  created_at timestamptz DEFAULT now(),
  UNIQUE(clerk_user_id, business_id)
);

CREATE INDEX idx_user_access_clerk ON user_business_access(clerk_user_id);
CREATE INDEX idx_user_access_business ON user_business_access(business_id);
