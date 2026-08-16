ALTER TABLE console_events
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'TARGET';

CREATE INDEX IF NOT EXISTS console_events_source_idx ON console_events (source);
