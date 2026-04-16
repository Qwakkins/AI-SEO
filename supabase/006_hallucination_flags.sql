CREATE TABLE hallucination_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  query_result_id uuid NOT NULL REFERENCES query_results(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  field text NOT NULL,
  ai_claim text NOT NULL,
  ground_truth_value text,
  flag_type text NOT NULL CHECK (flag_type IN ('incorrect', 'unverifiable', 'not_mentioned')),
  confidence numeric NOT NULL DEFAULT 1.0,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_hallucination_flags_business ON hallucination_flags(business_id);
CREATE INDEX idx_hallucination_flags_result ON hallucination_flags(query_result_id);
