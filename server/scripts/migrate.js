const fs = require('fs');
const path = require('path');
const db = require('../config/database');
const logger = require('../utils/logger');

async function runMigrations() {
  try {
    logger.info('Starting database migrations...');
    
    // 1) Apply base schema first
    const schemaPath = path.join(__dirname, '../../database/schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');
    await db.query(schema);
    logger.info('Base schema applied');

    // 2) Apply any additional *.sql migration files in /database (e.g., chartlink and fyers migrations)
    const dbDir = path.join(__dirname, '../../database');
    const files = fs.readdirSync(dbDir)
      .filter(f => f.endsWith('.sql') && f !== 'schema.sql')
      // Ensure deterministic order
      .sort();

    for (const file of files) {
      const filePath = path.join(dbDir, file);
      const sql = fs.readFileSync(filePath, 'utf8');
      logger.info(`Applying migration: ${file}`);
      await db.query(sql);
      logger.info(`Migration applied: ${file}`);
    }
    
    logger.info('All database migrations completed successfully');
    
    // Create default admin user if it doesn't exist
    const adminEmail = 'admin@tradingapp.com';
    const adminPassword = 'admin123'; // Change this in production!
    
    const existingAdmin = await db.query(
      'SELECT id FROM users WHERE email = $1',
      [adminEmail]
    );
    
    if (existingAdmin.rows.length === 0) {
      const bcrypt = require('bcryptjs');
      const passwordHash = await bcrypt.hash(adminPassword, 12);
      
      await db.query(
        'INSERT INTO users (email, password_hash, first_name, last_name) VALUES ($1, $2, $3, $4)',
        [adminEmail, passwordHash, 'Admin', 'User']
      );
      
      logger.info('Default admin user created', { email: adminEmail });
    }
    
    process.exit(0);
  } catch (error) {
    logger.error('Migration failed', { error: error.message });
    process.exit(1);
  }
}

runMigrations();
