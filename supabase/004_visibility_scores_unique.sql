-- MANDATORY: this constraint is required for the aggregator's upsert to work.
-- Without it, Postgres rejects ON CONFLICT with:
--   "there is no unique or exclusion constraint matching the ON CONFLICT specification"
-- Verified against @supabase/postgrest-js — the JS client passes onConflict columns
-- directly to Postgres; the constraint must exist at the DB level.
-- Must run AFTER 001_initial_schema.sql which creates the table.
ALTER TABLE visibility_scores
  ADD CONSTRAINT uq_visibility_scores_biz_platform_period
  UNIQUE (business_id, platform, period_start, period_end);
