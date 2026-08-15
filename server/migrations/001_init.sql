CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE,
  api_key_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS scans (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  url TEXT NOT NULL,
  normalized_url TEXT NOT NULL,
  status TEXT NOT NULL,
  status_reason TEXT,
  options JSONB NOT NULL DEFAULT '{}',
  result JSONB,
  scores JSONB,
  summary JSONB,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS scans_status_idx ON scans (status);
CREATE INDEX IF NOT EXISTS scans_created_at_idx ON scans (created_at DESC);
CREATE INDEX IF NOT EXISTS scans_normalized_url_idx ON scans (normalized_url);

CREATE TABLE IF NOT EXISTS scan_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_id UUID NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  title TEXT,
  status TEXT,
  status_code INTEGER,
  issues_count INTEGER DEFAULT 0,
  duration_ms INTEGER,
  depth INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS scan_pages_scan_id_idx ON scan_pages (scan_id);
CREATE INDEX IF NOT EXISTS scan_pages_url_idx ON scan_pages (url);

CREATE TABLE IF NOT EXISTS console_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_id UUID NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  text TEXT NOT NULL,
  page_url TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL,
  source_url TEXT,
  line INTEGER,
  col INTEGER,
  args JSONB,
  classification TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS console_events_scan_id_idx ON console_events (scan_id);
CREATE INDEX IF NOT EXISTS console_events_page_url_idx ON console_events (page_url);
CREATE INDEX IF NOT EXISTS console_events_timestamp_idx ON console_events (timestamp);

CREATE TABLE IF NOT EXISTS runtime_errors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_id UUID NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  stack TEXT,
  page_url TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL,
  source_url TEXT,
  line INTEGER,
  col INTEGER,
  type TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS runtime_errors_scan_id_idx ON runtime_errors (scan_id);
CREATE INDEX IF NOT EXISTS runtime_errors_page_url_idx ON runtime_errors (page_url);

CREATE TABLE IF NOT EXISTS network_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_id UUID NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  method TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  status INTEGER,
  request_headers JSONB,
  response_headers JSONB,
  response_size INTEGER,
  duration_ms INTEGER,
  page_url TEXT NOT NULL,
  initiator TEXT,
  failure_reason TEXT,
  is_api BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS network_events_scan_id_idx ON network_events (scan_id);
CREATE INDEX IF NOT EXISTS network_events_page_url_idx ON network_events (page_url);

CREATE TABLE IF NOT EXISTS network_failures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_id UUID NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  method TEXT NOT NULL,
  status INTEGER,
  reason TEXT NOT NULL,
  page_url TEXT NOT NULL,
  resource_type TEXT,
  duration_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS network_failures_scan_id_idx ON network_failures (scan_id);

CREATE TABLE IF NOT EXISTS performance_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_id UUID NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
  metrics JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS performance_metrics_scan_id_idx ON performance_metrics (scan_id);

CREATE TABLE IF NOT EXISTS accessibility_findings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_id UUID NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
  rule TEXT NOT NULL,
  impact TEXT,
  element_html TEXT,
  selector TEXT,
  page_url TEXT NOT NULL,
  description TEXT,
  help_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS accessibility_findings_scan_id_idx ON accessibility_findings (scan_id);
CREATE INDEX IF NOT EXISTS accessibility_findings_page_url_idx ON accessibility_findings (page_url);

CREATE TABLE IF NOT EXISTS security_findings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_id UUID NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  name TEXT NOT NULL,
  severity TEXT NOT NULL,
  status TEXT NOT NULL,
  evidence TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS security_findings_scan_id_idx ON security_findings (scan_id);
CREATE INDEX IF NOT EXISTS security_findings_severity_idx ON security_findings (severity);

CREATE TABLE IF NOT EXISTS seo_findings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_id UUID NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
  page_url TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS seo_findings_scan_id_idx ON seo_findings (scan_id);

CREATE TABLE IF NOT EXISTS asset_findings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_id UUID NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  page_url TEXT NOT NULL,
  resource_type TEXT,
  status INTEGER,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS asset_findings_scan_id_idx ON asset_findings (scan_id);

CREATE TABLE IF NOT EXISTS issues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_id UUID NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  category TEXT NOT NULL,
  severity TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  occurrences INTEGER NOT NULL DEFAULT 1,
  pages JSONB,
  evidence JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS issues_scan_id_idx ON issues (scan_id);
CREATE INDEX IF NOT EXISTS issues_severity_idx ON issues (severity);
CREATE INDEX IF NOT EXISTS issues_type_idx ON issues (type);

CREATE TABLE IF NOT EXISTS scan_artifacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_id UUID NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  path TEXT NOT NULL,
  content_type TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS scan_artifacts_scan_id_idx ON scan_artifacts (scan_id);
