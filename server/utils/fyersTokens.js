//server/utils/fyersTokens.js

const db = require('../config/database');
const logger = require('./logger');

/**
 * Get Fyers credentials for a user
 * @param {number} userId - User ID
 * @returns {Promise<{accessToken: string, refreshToken: string} | null>}
 */
async function getFyersCredentials(userId) {
  try {
    const result = await db.query(
      'SELECT fyers_credentials FROM settings WHERE user_id = $1',
      [userId]
    );

    if (result.rows.length === 0 || !result.rows[0].fyers_credentials) {
      return null;
    }

    const credentials = result.rows[0].fyers_credentials;
    
    // Handle both string and object formats
    if (typeof credentials === 'string') {
      return JSON.parse(credentials);
    }
    
    return credentials;
  } catch (error) {
    logger.error('Error retrieving Fyers credentials', { 
      error: error.message,
      userId 
    });
    return null;
  }
}

/**
 * Save Fyers credentials for a user
 * @param {number} userId - User ID
 * @param {object} credentials - Credentials object
 */
async function saveFyersCredentials(userId, credentials) {
  try {
    await db.query(
      `INSERT INTO settings (user_id, fyers_credentials, updated_at)
       VALUES ($1, $2, CURRENT_TIMESTAMP)
       ON CONFLICT (user_id)
       DO UPDATE SET 
         fyers_credentials = $2, 
         updated_at = CURRENT_TIMESTAMP`,
      [userId, JSON.stringify(credentials)]
    );
    
    logger.info('Fyers credentials saved', { userId });
    return true;
  } catch (error) {
    logger.error('Error saving Fyers credentials', { 
      error: error.message,
      userId 
    });
    return false;
  }
}

/**
 * Clear Fyers credentials for a user
 * @param {number} userId - User ID
 */
async function clearFyersCredentials(userId) {
  try {
    await db.query(
      `UPDATE settings 
       SET fyers_credentials = NULL, 
           updated_at = CURRENT_TIMESTAMP
       WHERE user_id = $1`,
      [userId]
    );
    
    logger.info('Fyers credentials cleared', { userId });
    return true;
  } catch (error) {
    logger.error('Error clearing Fyers credentials', { 
      error: error.message,
      userId 
    });
    return false;
  }
}

module.exports = {
  getFyersCredentials,
  saveFyersCredentials,
  clearFyersCredentials
};
