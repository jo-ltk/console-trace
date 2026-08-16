CREATE TABLE IF NOT EXISTS findings (
  id UUID PRIMARY KEY,
  scan_id UUID NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
  page_id UUID REFERENCES scan_pages(id) ON DELETE SET NULL,
  category TEXT NOT NULL,
  severity TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT,
  description TEXT,
  evidence_json JSONB NOT NULL DEFAULT '{}',
  recommendation TEXT,
  confidence TEXT,
  occurrences INTEGER NOT NULL DEFAULT 1,
  dedupe_key TEXT NOT NULL,
  first_observed_at TIMESTAMPTZ,
  last_observed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS findings_scan_id_idx ON findings (scan_id);
CREATE INDEX IF NOT EXISTS findings_severity_idx ON findings (severity);
CREATE INDEX IF NOT EXISTS findings_category_idx ON findings (category);
CREATE INDEX IF NOT EXISTS findings_dedupe_key_idx ON findings (scan_id, dedupe_key);
