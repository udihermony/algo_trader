const express = require('express');
const Joi = require('joi');
const db = require('../config/database');
const logger = require('../utils/logger');

const router = express.Router();

// Validation schema for settings
const settingsSchema = Joi.object({
  riskParams: Joi.object({
    maxPositions: Joi.number().integer().positive(),
    maxPositionSize: Joi.number().positive(),
    dailyLossLimit: Joi.number().positive(),
    maxRiskPerTrade: Joi.number().min(0).max(100)
  }),
  notificationPrefs: Joi.object({
    email: Joi.boolean(),
    sms: Joi.boolean(),
    telegram: Joi.boolean(),
    orderNotifications: Joi.boolean(),
    alertNotifications: Joi.boolean(),
    errorNotifications: Joi.boolean()
  }),
  tradingHours: Joi.object({
    startTime: Joi.string().pattern(/^\d{2}:\d{2}$/),
    endTime: Joi.string().pattern(/^\d{2}:\d{2}$/),
    timezone: Joi.string()
  })
});

// Get user settings
router.get('/', async (req, res) => {
  try {
    const result = await db.query(
      'SELECT * FROM settings WHERE user_id = $1',
      [req.user.id]
    );

    if (result.rows.length === 0) {
      // Return default settings
      return res.json({
        riskParams: {
          maxPositions: 10,
          maxPositionSize: 100000,
          dailyLossLimit: 10000,
          maxRiskPerTrade: 2
        },
        notificationPrefs: {
          email: true,
          sms: false,
          telegram: false,
          orderNotifications: true,
          alertNotifications: true,
          errorNotifications: true
        },
        tradingHours: {
          startTime: '09:15',
          endTime: '15:30',
          timezone: 'Asia/Kolkata'
        }
      });
    }

    const settings = result.rows[0];
    
    res.json({
      riskParams: settings.risk_params || {},
      notificationPrefs: settings.notification_prefs || {},
      tradingHours: settings.trading_hours || {}
    });

  } catch (error) {
    logger.error('Settings fetch error', { 
      error: error.message, 
      userId: req.user.id 
    });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update user settings
router.put('/', async (req, res) => {
  try {
    const { error, value } = settingsSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const { riskParams, notificationPrefs, tradingHours } = value;

    const result = await db.query(
      `INSERT INTO settings (user_id, risk_params, notification_prefs, trading_hours)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id) 
       DO UPDATE SET 
         risk_params = $2,
         notification_prefs = $3,
         trading_hours = $4,
         updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [
        req.user.id,
        JSON.stringify(riskParams),
        JSON.stringify(notificationPrefs),
        JSON.stringify(tradingHours)
      ]
    );

    logger.info('Settings updated', { userId: req.user.id });

    res.json({
      message: 'Settings updated successfully',
      settings: {
        riskParams: result.rows[0].risk_params,
        notificationPrefs: result.rows[0].notification_prefs,
        tradingHours: result.rows[0].trading_hours
      }
    });

  } catch (error) {
    logger.error('Settings update error', { 
      error: error.message, 
      userId: req.user.id 
    });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update Fyers credentials
router.put('/fyers', async (req, res) => {
  try {
    const { accessToken, refreshToken, expiresIn } = req.body;

    if (!accessToken) {
      return res.status(400).json({ error: 'Access token is required' });
    }

    const credentials = {
      accessToken,
      refreshToken,
      expiresIn,
      updatedAt: new Date().toISOString()
    };

    const result = await db.query(
      `INSERT INTO settings (user_id, fyers_credentials)
       VALUES ($1, $2)
       ON CONFLICT (user_id) 
       DO UPDATE SET 
         fyers_credentials = $2,
         updated_at = CURRENT_TIMESTAMP
       RETURNING id`,
      [req.user.id, JSON.stringify(credentials)]
    );

    logger.info('Fyers credentials updated', { userId: req.user.id });

    res.json({
      message: 'Fyers credentials updated successfully'
    });

  } catch (error) {
    logger.error('Fyers credentials update error', { 
      error: error.message, 
      userId: req.user.id 
    });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get P&L data
router.get('/pnl', async (req, res) => {
  try {
    const { period = '30d', type = 'both' } = req.query;
    
    let dateFilter = '';
    switch (period) {
      case '1d':
        dateFilter = 'AND executed_at >= CURRENT_DATE';
        break;
      case '7d':
        dateFilter = 'AND executed_at >= CURRENT_DATE - INTERVAL \'7 days\'';
        break;
      case '30d':
        dateFilter = 'AND executed_at >= CURRENT_DATE - INTERVAL \'30 days\'';
        break;
      case '90d':
        dateFilter = 'AND executed_at >= CURRENT_DATE - INTERVAL \'90 days\'';
        break;
    }

    let query = '';
    const params = [req.user.id];

    if (type === 'realized' || type === 'both') {
      query += `
        SELECT 
          DATE(executed_at) as date,
          SUM(pnl) as realized_pnl,
          SUM(charges) as charges,
          COUNT(*) as trade_count
        FROM trades 
        WHERE user_id = $1 ${dateFilter}
        GROUP BY DATE(executed_at)
        ORDER BY date DESC
      `;
    }

    if (type === 'unrealized' || type === 'both') {
      if (query) query += ' UNION ALL ';
      query += `
        SELECT 
          CURRENT_DATE as date,
          SUM(unrealized_pnl) as unrealized_pnl,
          0 as charges,
          0 as trade_count
        FROM positions 
        WHERE user_id = $1 AND is_active = true
      `;
    }

    const result = await db.query(query, params);

    // Calculate totals
    const totals = result.rows.reduce((acc, row) => {
      acc.realizedPnL += parseFloat(row.realized_pnl || 0);
      acc.unrealizedPnL += parseFloat(row.unrealized_pnl || 0);
      acc.charges += parseFloat(row.charges || 0);
      acc.tradeCount += parseInt(row.trade_count || 0);
      return acc;
    }, {
      realizedPnL: 0,
      unrealizedPnL: 0,
      charges: 0,
      tradeCount: 0
    });

    res.json({
      period: period,
      data: result.rows,
      totals: {
        realizedPnL: totals.realizedPnL,
        unrealizedPnL: totals.unrealizedPnL,
        totalPnL: totals.realizedPnL + totals.unrealizedPnL,
        totalCharges: totals.charges,
        tradeCount: totals.tradeCount
      }
    });

  } catch (error) {
    logger.error('P&L fetch error', { 
      error: error.message, 
      userId: req.user.id 
    });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get dashboard summary
router.get('/dashboard', async (req, res) => {
  try {
    const userId = req.user.id;

    // Get active positions count
    const positionsResult = await db.query(
      'SELECT COUNT(*) as count FROM positions WHERE user_id = $1 AND is_active = true',
      [userId]
    );

    // Get today's P&L
    const todayPnLResult = await db.query(
      `SELECT COALESCE(SUM(pnl), 0) as pnl 
       FROM trades 
       WHERE user_id = $1 AND executed_at >= CURRENT_DATE`,
      [userId]
    );

    // Get pending orders count
    const ordersResult = await db.query(
      'SELECT COUNT(*) as count FROM orders WHERE user_id = $1 AND status = $2',
      [userId, 'PENDING']
    );

    // Get active strategies count
    const strategiesResult = await db.query(
      'SELECT COUNT(*) as count FROM strategies WHERE user_id = $1 AND is_active = true',
      [userId]
    );

    // Get recent alerts
    const alertsResult = await db.query(
      `SELECT symbol, action, price, received_at, status
       FROM alerts 
       WHERE user_id = $1 
       ORDER BY received_at DESC 
       LIMIT 5`,
      [userId]
    );

    res.json({
      summary: {
        activePositions: parseInt(positionsResult.rows[0].count),
        todayPnL: parseFloat(todayPnLResult.rows[0].pnl),
        pendingOrders: parseInt(ordersResult.rows[0].count),
        activeStrategies: parseInt(strategiesResult.rows[0].count)
      },
      recentAlerts: alertsResult.rows
    });

  } catch (error) {
    logger.error('Dashboard fetch error', { 
      error: error.message, 
      userId: req.user.id 
    });
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
