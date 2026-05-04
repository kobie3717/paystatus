ALTER TABLE status_checks ADD COLUMN confidence TEXT NOT NULL DEFAULT 'low'
  CHECK (confidence IN ('low', 'medium', 'high'));
