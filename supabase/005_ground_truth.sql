CREATE TABLE business_ground_truth (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  phone text,
  address_street text,
  address_city text,
  address_state text,
  address_zip text,
  website_url text,
  services text[] DEFAULT '{}',
  verified_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(business_id)
);
