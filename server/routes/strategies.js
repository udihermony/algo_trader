const express = require('express');
const Joi = require('joi');
const db = require('../config/database');
const logger = require('../utils/logger');

const router = express.Router();

// Validation schema for strategy
const strategySchema = Joi.object({
  name: Joi.string().required(),
  description: Joi.string().allow(''),
  config: Joi.object({
    allowedSymbols: Joi.array().items(Joi.string()),
    blockedSymbols: Joi.array().items(Joi.string()),
    defaultQuantity: Joi.number().integer().positive(),
    orderType: Joi.string().valid('MARKET', 'LIMIT', 'STOP_LOSS'),
    productType: Joi.string().valid('INTRADAY', 'CNC', 'MARGIN'),
    stopLoss: Joi.number().min(0).max(100),
    takeProfit: Joi.number().min(0).max(100),
    tradingHours: Joi.object({
      startTime: Joi.string().pattern(/^\d{2}:\d{2}$/),
      endTime: Joi.string().pattern(/^\d{2}:\d{2}$/)
    }),
    riskParams: Joi.object({
      maxPositions: Joi.number().integer().positive(),
      maxPositionSize: Joi.number().positive(),
      dailyLossLimit: Joi.number().positive(),
      maxRiskPerTrade: Joi.number().min(0).max(100)
    })
  }).required(),
  isActive: Joi.boolean()
});

// Get strategies
router.get('/', async (req, res) => {
  try {
    const result = await db.query(
      'SELECT * FROM strategies WHERE user_id = $1 ORDER BY created_at DESC',
      [req.user.id]
    );

    res.json(result.rows);

  } catch (error) {
    logger.error('Strategies fetch error', { 
      error: error.message, 
      userId: req.user.id 
    });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get strategy by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await db.query(
      'SELECT * FROM strategies WHERE id = $1 AND user_id = $2',
      [id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Strategy not found' });
    }

    res.json(result.rows[0]);

  } catch (error) {
    logger.error('Strategy fetch error', { 
      error: error.message, 
      userId: req.user.id,
      strategyId: req.params.id
    });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create strategy
router.post('/', async (req, res) => {
  try {
    const { error, value } = strategySchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const { name, description, config, isActive = false } = value;

    const result = await db.query(
      `INSERT INTO strategies (user_id, name, description, config, is_active)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, description, config, is_active, created_at`,
      [req.user.id, name, description, JSON.stringify(config), isActive]
    );

    logger.info('Strategy created', {
      userId: req.user.id,
      strategyId: result.rows[0].id,
      name: name
    });

    res.status(201).json(result.rows[0]);

  } catch (error) {
    logger.error('Strategy creation error', { 
      error: error.message, 
      userId: req.user.id 
    });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update strategy
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { error, value } = strategySchema.validate(req.body);
    
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const { name, description, config, isActive } = value;

    const result = await db.query(
      `UPDATE strategies 
       SET name = $1, description = $2, config = $3, is_active = $4
       WHERE id = $5 AND user_id = $6
       RETURNING id, name, description, config, is_active, updated_at`,
      [name, description, JSON.stringify(config), isActive, id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Strategy not found' });
    }

    logger.info('Strategy updated', {
      userId: req.user.id,
      strategyId: id,
      name: name
    });

    res.json(result.rows[0]);

  } catch (error) {
    logger.error('Strategy update error', { 
      error: error.message, 
      userId: req.user.id,
      strategyId: req.params.id
    });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete strategy
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await db.query(
      'DELETE FROM strategies WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Strategy not found' });
    }

    logger.info('Strategy deleted', {
      userId: req.user.id,
      strategyId: id
    });

    res.json({ message: 'Strategy deleted successfully' });

  } catch (error) {
    logger.error('Strategy deletion error', { 
      error: error.message, 
      userId: req.user.id,
      strategyId: req.params.id
    });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Toggle strategy active status
router.patch('/:id/toggle', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await db.query(
      `UPDATE strategies 
       SET is_active = NOT is_active
       WHERE id = $1 AND user_id = $2
       RETURNING id, name, is_active`,
      [id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Strategy not found' });
    }

    const strategy = result.rows[0];

    logger.info('Strategy status toggled', {
      userId: req.user.id,
      strategyId: id,
      isActive: strategy.is_active
    });

    res.json({
      message: `Strategy ${strategy.is_active ? 'activated' : 'deactivated'}`,
      isActive: strategy.is_active
    });

  } catch (error) {
    logger.error('Strategy toggle error', { 
      error: error.message, 
      userId: req.user.id,
      strategyId: req.params.id
    });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get strategy performance
router.get('/:id/performance', async (req, res) => {
  try {
    const { id } = req.params;
    const { period = '30d' } = req.query;

    // Verify strategy belongs to user
    const strategyResult = await db.query(
      'SELECT id FROM strategies WHERE id = $1 AND user_id = $2',
      [id, req.user.id]
    );

    if (strategyResult.rows.length === 0) {
      return res.status(404).json({ error: 'Strategy not found' });
    }

    let dateFilter = '';
    switch (period) {
      case '1d':
        dateFilter = 'AND o.created_at >= CURRENT_DATE';
        break;
      case '7d':
        dateFilter = 'AND o.created_at >= CURRENT_DATE - INTERVAL \'7 days\'';
        break;
      case '30d':
        dateFilter = 'AND o.created_at >= CURRENT_DATE - INTERVAL \'30 days\'';
        break;
      case '90d':
        dateFilter = 'AND o.created_at >= CURRENT_DATE - INTERVAL \'90 days\'';
        break;
    }

    // Get order statistics
    const orderStatsQuery = `
      SELECT 
        COUNT(*) as total_orders,
        COUNT(CASE WHEN status = 'FILLED' THEN 1 END) as filled_orders,
        COUNT(CASE WHEN status = 'CANCELLED' THEN 1 END) as cancelled_orders,
        COUNT(CASE WHEN status = 'REJECTED' THEN 1 END) as rejected_orders,
        COALESCE(SUM(charges), 0) as total_charges
      FROM orders 
      WHERE strategy_id = $1 ${dateFilter}
    `;

    const orderStats = await db.query(orderStatsQuery, [id]);

    // Get trade statistics
    const tradeStatsQuery = `
      SELECT 
        COUNT(*) as total_trades,
        COALESCE(SUM(pnl), 0) as total_pnl,
        COALESCE(AVG(pnl), 0) as avg_pnl,
        COALESCE(SUM(charges), 0) as total_charges
      FROM trades t
      JOIN orders o ON t.order_id = o.id
      WHERE o.strategy_id = $1 ${dateFilter}
    `;

    const tradeStats = await db.query(tradeStatsQuery, [id]);

    // Get top symbols
    const topSymbolsQuery = `
      SELECT symbol, COUNT(*) as order_count
      FROM orders 
      WHERE strategy_id = $1 ${dateFilter}
      GROUP BY symbol 
      ORDER BY order_count DESC 
      LIMIT 5
    `;

    const topSymbols = await db.query(topSymbolsQuery, [id]);

    res.json({
      period: period,
      orders: {
        total: parseInt(orderStats.rows[0].total_orders),
        filled: parseInt(orderStats.rows[0].filled_orders),
        cancelled: parseInt(orderStats.rows[0].cancelled_orders),
        rejected: parseInt(orderStats.rows[0].rejected_orders),
        totalCharges: parseFloat(orderStats.rows[0].total_charges)
      },
      trades: {
        total: parseInt(tradeStats.rows[0].total_trades),
        totalPnL: parseFloat(tradeStats.rows[0].total_pnl),
        avgPnL: parseFloat(tradeStats.rows[0].avg_pnl),
        totalCharges: parseFloat(tradeStats.rows[0].total_charges)
      },
      topSymbols: topSymbols.rows
    });

  } catch (error) {
    logger.error('Strategy performance error', { 
      error: error.message, 
      userId: req.user.id,
      strategyId: req.params.id
    });
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
