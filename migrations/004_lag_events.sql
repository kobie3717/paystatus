CREATE TABLE lag_events (
  id BIGSERIAL PRIMARY KEY,
  provider TEXT NOT NULL,
  our_detected_at TIMESTAMPTZ NOT NULL,
  our_layer TEXT NOT NULL CHECK (our_layer IN ('sandbox', 'http_probe', 'both')),
  vendor_acknowledged_at TIMESTAMPTZ,
  lag_seconds INTEGER,
  resolved BOOLEAN NOT NULL DEFAULT FALSE,
  outcome TEXT CHECK (outcome IN ('confirmed', 'false_alarm', 'pending')) NOT NULL DEFAULT 'pending',
  summary TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_lag_events_provider_detected ON lag_events (provider, our_detected_at DESC);
CREATE INDEX idx_lag_events_outcome ON lag_events (outcome, lag_seconds DESC);
CREATE INDEX idx_lag_events_pending ON lag_events (provider) WHERE outcome = 'pending';
