-- Enhanced Alerts table for Chartlink integration
-- This adds Chartlink-specific fields while maintaining backward compatibility

-- Add new columns to existing alerts table
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS scan_name VARCHAR(255);
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS scan_url VARCHAR(255);
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS alert_name VARCHAR(255);
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS triggered_at VARCHAR(50);
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS source VARCHAR(50) DEFAULT 'chartlink';

-- Add index for better performance
CREATE INDEX IF NOT EXISTS idx_alerts_scan_name ON alerts(scan_name);
CREATE INDEX IF NOT EXISTS idx_alerts_source ON alerts(source);
CREATE INDEX IF NOT EXISTS idx_alerts_triggered_at ON alerts(triggered_at);
