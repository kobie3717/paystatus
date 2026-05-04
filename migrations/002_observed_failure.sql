ALTER TABLE status_checks DROP CONSTRAINT IF EXISTS status_checks_status_check;
ALTER TABLE status_checks ADD CONSTRAINT status_checks_status_check
  CHECK (status IN ('up', 'degraded', 'down', 'drift', 'skipped', 'observed_failure'));

ALTER TABLE incidents DROP CONSTRAINT IF EXISTS incidents_severity_check;
ALTER TABLE incidents ADD CONSTRAINT incidents_severity_check
  CHECK (severity IN ('outage', 'degraded', 'drift', 'observation'));
