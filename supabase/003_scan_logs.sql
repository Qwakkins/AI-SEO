-- Scan cycle logs for auditing and debugging
CREATE TABLE scan_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_type text NOT NULL CHECK (scan_type IN ('cron_weekly', 'manual')),
  businesses_scanned integer NOT NULL,
  businesses_failed integer NOT NULL,
  total_duration_ms integer,
  details jsonb,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_scan_logs_created ON scan_logs(created_at);
CREATE INDEX idx_scan_logs_type ON scan_logs(scan_type);
