CREATE TABLE status_checks (
  id BIGSERIAL PRIMARY KEY,
  provider TEXT NOT NULL,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL CHECK (status IN ('up', 'degraded', 'down', 'drift', 'skipped')),
  latency_ms INTEGER,
  error_code TEXT,
  error_message TEXT,
  drift_detected BOOLEAN NOT NULL DEFAULT false,
  drift_summary TEXT
);

CREATE INDEX idx_status_provider_time
  ON status_checks (provider, checked_at DESC);

CREATE INDEX idx_status_recent
  ON status_checks (checked_at DESC);

CREATE TABLE incidents (
  id BIGSERIAL PRIMARY KEY,
  provider TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL,
  resolved_at TIMESTAMPTZ,
  severity TEXT NOT NULL CHECK (severity IN ('outage', 'degraded', 'drift')),
  summary TEXT NOT NULL
);

CREATE INDEX idx_incidents_provider_started
  ON incidents (provider, started_at DESC);

CREATE TABLE subscribers (
  id BIGSERIAL PRIMARY KEY,
  email TEXT NOT NULL,
  provider TEXT,
  threshold TEXT,
  subscribed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  active BOOLEAN NOT NULL DEFAULT true
);

CREATE INDEX idx_subscribers_active
  ON subscribers (active, subscribed_at DESC);
