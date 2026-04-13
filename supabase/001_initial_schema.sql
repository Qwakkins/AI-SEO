-- Businesses being tracked
CREATE TABLE businesses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  location text NOT NULL,
  category text NOT NULL,
  website_url text,
  created_at timestamptz DEFAULT now()
);

-- Keywords/prompts to track for each business
CREATE TABLE tracking_queries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  query_template text NOT NULL,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Results from each AI platform query
CREATE TABLE query_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tracking_query_id uuid NOT NULL REFERENCES tracking_queries(id) ON DELETE CASCADE,
  platform text NOT NULL,
  response_text text NOT NULL,
  business_mentioned boolean NOT NULL,
  mention_context text,
  position_in_response integer,
  competitors_mentioned text[],
  queried_at timestamptz DEFAULT now()
);

-- Aggregated visibility scores
CREATE TABLE visibility_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  platform text NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  total_queries integer NOT NULL,
  times_mentioned integer NOT NULL,
  mention_rate numeric NOT NULL,
  avg_position numeric,
  created_at timestamptz DEFAULT now()
);

-- Indexes for common queries
CREATE INDEX idx_tracking_queries_business ON tracking_queries(business_id);
CREATE INDEX idx_query_results_tracking_query ON query_results(tracking_query_id);
CREATE INDEX idx_query_results_queried_at ON query_results(queried_at);
CREATE INDEX idx_visibility_scores_business ON visibility_scores(business_id);
CREATE INDEX idx_visibility_scores_period ON visibility_scores(period_start, period_end);
