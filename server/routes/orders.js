const express = require('express');
const db = require('../config/database');
const logger = require('../utils/logger');

const router = express.Router();

// Get orders with pagination
router.get('/', async (req, res) => {
  try {
    const { 
      limit = 50, 
      offset = 0, 
      status, 
      symbol,
      startDate,
      endDate 
    } = req.query;

    let query = `
      SELECT o.*, s.name as strategy_name, a.action as alert_action
      FROM orders o
      LEFT JOIN strategies s ON o.strategy_id = s.id
      LEFT JOIN alerts a ON o.alert_id = a.id
      WHERE o.user_id = $1
    `;
    
    const params = [req.user.id];
    let paramCount = 1;

    if (status) {
      paramCount++;
      query += ` AND o.status = $${paramCount}`;
      params.push(status);
    }

    if (symbol) {
      paramCount++;
      query += ` AND o.symbol ILIKE $${paramCount}`;
      params.push(`%${symbol}%`);
    }

    if (startDate) {
      paramCount++;
      query += ` AND o.created_at >= $${paramCount}`;
      params.push(startDate);
    }

    if (endDate) {
      paramCount++;
      query += ` AND o.created_at <= $${paramCount}`;
      params.push(endDate);
    }

    query += ` ORDER BY o.created_at DESC LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
    params.push(parseInt(limit), parseInt(offset));

    const result = await db.query(query, params);

    // Get total count
    let countQuery = 'SELECT COUNT(*) FROM orders WHERE user_id = $1';
    const countParams = [req.user.id];
    let countParamCount = 1;

    if (status) {
      countParamCount++;
      countQuery += ` AND status = $${countParamCount}`;
      countParams.push(status);
    }

    if (symbol) {
      countParamCount++;
      countQuery += ` AND symbol ILIKE $${countParamCount}`;
      countParams.push(`%${symbol}%`);
    }

    if (startDate) {
      countParamCount++;
      countQuery += ` AND created_at >= $${countParamCount}`;
      countParams.push(startDate);
    }

    if (endDate) {
      countParamCount++;
      countQuery += ` AND created_at <= $${countParamCount}`;
      countParams.push(endDate);
    }

    const countResult = await db.query(countQuery, countParams);
    const totalCount = parseInt(countResult.rows[0].count);

    res.json({
      orders: result.rows,
      pagination: {
        total: totalCount,
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: (parseInt(offset) + parseInt(limit)) < totalCount
      }
    });

  } catch (error) {
    logger.error('Orders fetch error', { 
      error: error.message, 
      userId: req.user.id 
    });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get order by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await db.query(
      `SELECT o.*, s.name as strategy_name, a.action as alert_action
       FROM orders o
       LEFT JOIN strategies s ON o.strategy_id = s.id
       LEFT JOIN alerts a ON o.alert_id = a.id
       WHERE o.id = $1 AND o.user_id = $2`,
      [id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }

    res.json(result.rows[0]);

  } catch (error) {
    logger.error('Order fetch error', { 
      error: error.message, 
      userId: req.user.id,
      orderId: req.params.id
    });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get order statistics
router.get('/stats/summary', async (req, res) => {
  try {
    const { period = '7d' } = req.query;
    
    let dateFilter = '';
    const params = [req.user.id];
    
    switch (period) {
      case '1d':
        dateFilter = 'AND created_at >= CURRENT_DATE';
        break;
      case '7d':
        dateFilter = 'AND created_at >= CURRENT_DATE - INTERVAL \'7 days\'';
        break;
      case '30d':
        dateFilter = 'AND created_at >= CURRENT_DATE - INTERVAL \'30 days\'';
        break;
      case '90d':
        dateFilter = 'AND created_at >= CURRENT_DATE - INTERVAL \'90 days\'';
        break;
    }

    const statsQuery = `
      SELECT 
        COUNT(*) as total_orders,
        COUNT(CASE WHEN status = 'FILLED' THEN 1 END) as filled_orders,
        COUNT(CASE WHEN status = 'PENDING' THEN 1 END) as pending_orders,
        COUNT(CASE WHEN status = 'CANCELLED' THEN 1 END) as cancelled_orders,
        COUNT(CASE WHEN status = 'REJECTED' THEN 1 END) as rejected_orders,
        COUNT(CASE WHEN side = 'BUY' THEN 1 END) as buy_orders,
        COUNT(CASE WHEN side = 'SELL' THEN 1 END) as sell_orders,
        COALESCE(SUM(charges), 0) as total_charges
      FROM orders 
      WHERE user_id = $1 ${dateFilter}
    `;

    const result = await db.query(statsQuery, params);
    const stats = result.rows[0];

    // Get top symbols
    const symbolsQuery = `
      SELECT symbol, COUNT(*) as count
      FROM orders 
      WHERE user_id = $1 ${dateFilter}
      GROUP BY symbol 
      ORDER BY count DESC 
      LIMIT 10
    `;

    const symbolsResult = await db.query(symbolsQuery, params);

    res.json({
      summary: {
        total: parseInt(stats.total_orders),
        filled: parseInt(stats.filled_orders),
        pending: parseInt(stats.pending_orders),
        cancelled: parseInt(stats.cancelled_orders),
        rejected: parseInt(stats.rejected_orders),
        buy: parseInt(stats.buy_orders),
        sell: parseInt(stats.sell_orders),
        totalCharges: parseFloat(stats.total_charges)
      },
      topSymbols: symbolsResult.rows
    });

  } catch (error) {
    logger.error('Order stats error', { 
      error: error.message, 
      userId: req.user.id 
    });
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
