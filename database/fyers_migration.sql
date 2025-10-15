-- Add auto execution flag to settings and helpful index
ALTER TABLE settings
ADD COLUMN IF NOT EXISTS auto_execute_enabled BOOLEAN DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_settings_auto_execute ON settings(auto_execute_enabled);

-- Ensure settings row exists for user 1 (optional helper during initial setup)
INSERT INTO settings (user_id)
SELECT 1
WHERE NOT EXISTS (SELECT 1 FROM settings WHERE user_id = 1);


