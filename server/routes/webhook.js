const express = require('express');
const Joi = require('joi');
const db = require('../config/database');
const { verifyWebhookSignature } = require('../middleware/auth');
const logger = require('../utils/logger');
const orderExecutionService = require('../services/orderExecutionService');

const router = express.Router();

// Validation schema for Chartlink alert (actual format)
const chartlinkSchema = Joi.object({
  stocks: Joi.string().required(),
  trigger_prices: Joi.string().required(),
  triggered_at: Joi.string().required(),
  scan_name: Joi.string().required(),
  scan_url: Joi.string().required(),
  alert_name: Joi.string().required(),
  webhook_url: Joi.string().optional()
});

// Legacy schema for backward compatibility
const alertSchema = Joi.object({
  symbol: Joi.string().required(),
  action: Joi.string().valid('BUY', 'SELL', 'HOLD').required(),
  price: Joi.number().positive().optional(),
  quantity: Joi.number().integer().positive().optional(),
  timeframe: Joi.string().optional(),
  indicators: Joi.object().optional(),
  strategy: Joi.string().optional(),
  timestamp: Joi.date().optional(),
  metadata: Joi.object().optional()
});

// Webhook endpoint to receive Chartlink alerts
router.post('/chartlink', verifyWebhookSignature, async (req, res) => {
  try {
    // Try Chartlink format first
    let { error, value } = chartlinkSchema.validate(req.body);
    let alertData;
    
    if (error) {
      // Fallback to legacy format
      const legacyResult = alertSchema.validate(req.body);
      if (legacyResult.error) {
        logger.warn('Invalid alert data received', { 
          error: error.details[0].message,
          data: req.body
        });
        return res.status(400).json({ error: 'Invalid alert format' });
      }
      alertData = legacyResult.value;
    } else {
      // Process Chartlink format
      const stocks = value.stocks.split(',');
      const prices = value.trigger_prices.split(',');
      
      // Convert Chartlink format to our internal format
      alertData = {
        symbol: stocks[0], // Take first stock for now
        action: 'BUY', // Chartlink breakouts are typically BUY signals
        price: parseFloat(prices[0]),
        quantity: 1, // Default quantity
        timeframe: '1h', // Default timeframe
        strategy: value.scan_name,
        timestamp: new Date(),
        metadata: {
          chartlink_data: value,
          all_stocks: stocks,
          all_prices: prices,
          scan_url: value.scan_url,
          alert_name: value.alert_name
        }
      };
    }
    
    // For now, we'll process alerts for all users
    // In a multi-user system, you'd need to determine which user this alert is for
    const users = await db.query('SELECT id FROM users WHERE is_active = true');
    
    if (users.rows.length === 0) {
      logger.warn('No active users found for alert processing');
      return res.status(200).json({ message: 'No active users' });
    }

    // Process alert for each user
    const processedAlerts = [];
    
    for (const user of users.rows) {
      try {
        // Store alert in database
        const alertResult = await db.query(
          `INSERT INTO alerts (user_id, symbol, action, price, quantity, data, received_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING id`,
          [
            user.id,
            alertData.symbol,
            alertData.action,
            alertData.price,
            alertData.quantity,
            JSON.stringify(alertData),
            new Date()
          ]
        );

        const alertId = alertResult.rows[0].id;

        // Process the alert for trading
        await orderExecutionService.processAlert(user.id, alertId, alertData);

        processedAlerts.push({
          userId: user.id,
          alertId: alertId,
          status: 'processed'
        });

        logger.info('Alert processed successfully', {
          userId: user.id,
          alertId: alertId,
          symbol: alertData.symbol,
          action: alertData.action
        });

      } catch (userError) {
        logger.error('Error processing alert for user', {
          userId: user.id,
          error: userError.message,
          alertData: alertData
        });

        processedAlerts.push({
          userId: user.id,
          status: 'error',
          error: userError.message
        });
      }
    }

    res.json({
      message: 'Alert processed',
      processedCount: processedAlerts.length,
      alerts: processedAlerts
    });

  } catch (error) {
    logger.error('Webhook processing error', { 
      error: error.message,
      body: req.body
    });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Test webhook endpoint (without signature verification)
router.post('/chartlink/test', async (req, res) => {
  try {
    // Try Chartlink format first
    let { error, value } = chartlinkSchema.validate(req.body);
    let processedData;
    
    if (error) {
      // Fallback to legacy format
      const legacyResult = alertSchema.validate(req.body);
      if (legacyResult.error) {
        return res.status(400).json({ error: 'Invalid alert format' });
      }
      processedData = legacyResult.value;
    } else {
      // Process Chartlink format
      const stocks = value.stocks.split(',');
      const prices = value.trigger_prices.split(',');
      
      processedData = {
        symbol: stocks[0],
        action: 'BUY',
        price: parseFloat(prices[0]),
        quantity: 1,
        timeframe: '1h',
        strategy: value.scan_name,
        timestamp: new Date(),
        metadata: {
          chartlink_data: value,
          all_stocks: stocks,
          all_prices: prices,
          scan_url: value.scan_url,
          alert_name: value.alert_name
        }
      };
    }

    logger.info('Test webhook received', { 
      original: req.body,
      processed: processedData 
    });
    
    res.json({
      message: 'Test webhook received successfully',
      original_data: req.body,
      processed_data: processedData,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Test webhook error', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get webhook logs
router.get('/logs', async (req, res) => {
  try {
    const { limit = 50, offset = 0 } = req.query;
    
    const result = await db.query(
      `SELECT a.*, u.email as user_email
       FROM alerts a
       JOIN users u ON a.user_id = u.id
       ORDER BY a.received_at DESC
       LIMIT $1 OFFSET $2`,
      [parseInt(limit), parseInt(offset)]
    );

    const countResult = await db.query('SELECT COUNT(*) FROM alerts');
    const totalCount = parseInt(countResult.rows[0].count);

    res.json({
      alerts: result.rows,
      pagination: {
        total: totalCount,
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: (parseInt(offset) + parseInt(limit)) < totalCount
      }
    });

  } catch (error) {
    logger.error('Webhook logs fetch error', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
