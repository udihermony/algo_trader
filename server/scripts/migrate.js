const fs = require('fs');
const path = require('path');
const db = require('../config/database');
const logger = require('../utils/logger');

async function runMigrations() {
  try {
    logger.info('Starting database migrations...');
    
    // Read schema file
    const schemaPath = path.join(__dirname, '../../database/schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');
    
    // Execute schema
    await db.query(schema);
    
    logger.info('Database migrations completed successfully');
    
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
