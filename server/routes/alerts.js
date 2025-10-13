const express = require('express');
const db = require('../config/database');
const logger = require('../utils/logger');

const router = express.Router();

// Get alerts with pagination
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
      SELECT a.*, s.name as strategy_name
      FROM alerts a
      LEFT JOIN strategies s ON a.strategy_id = s.id
      WHERE a.user_id = $1
    `;
    
    const params = [req.user.id];
    let paramCount = 1;

    if (status) {
      paramCount++;
      query += ` AND a.status = $${paramCount}`;
      params.push(status);
    }

    if (symbol) {
      paramCount++;
      query += ` AND a.symbol ILIKE $${paramCount}`;
      params.push(`%${symbol}%`);
    }

    if (startDate) {
      paramCount++;
      query += ` AND a.received_at >= $${paramCount}`;
      params.push(startDate);
    }

    if (endDate) {
      paramCount++;
      query += ` AND a.received_at <= $${paramCount}`;
      params.push(endDate);
    }

    query += ` ORDER BY a.received_at DESC LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
    params.push(parseInt(limit), parseInt(offset));

    const result = await db.query(query, params);

    // Get total count
    let countQuery = 'SELECT COUNT(*) FROM alerts WHERE user_id = $1';
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
      countQuery += ` AND received_at >= $${countParamCount}`;
      countParams.push(startDate);
    }

    if (endDate) {
      countParamCount++;
      countQuery += ` AND received_at <= $${countParamCount}`;
      countParams.push(endDate);
    }

    const countResult = await db.query(countQuery, countParams);
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
    logger.error('Alerts fetch error', { 
      error: error.message, 
      userId: req.user.id 
    });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get alert by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await db.query(
      `SELECT a.*, s.name as strategy_name
       FROM alerts a
       LEFT JOIN strategies s ON a.strategy_id = s.id
       WHERE a.id = $1 AND a.user_id = $2`,
      [id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Alert not found' });
    }

    res.json(result.rows[0]);

  } catch (error) {
    logger.error('Alert fetch error', { 
      error: error.message, 
      userId: req.user.id,
      alertId: req.params.id
    });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get alert statistics
router.get('/stats/summary', async (req, res) => {
  try {
    const { period = '7d' } = req.query;
    
    let dateFilter = '';
    const params = [req.user.id];
    
    switch (period) {
      case '1d':
        dateFilter = 'AND received_at >= CURRENT_DATE';
        break;
      case '7d':
        dateFilter = 'AND received_at >= CURRENT_DATE - INTERVAL \'7 days\'';
        break;
      case '30d':
        dateFilter = 'AND received_at >= CURRENT_DATE - INTERVAL \'30 days\'';
        break;
      case '90d':
        dateFilter = 'AND received_at >= CURRENT_DATE - INTERVAL \'90 days\'';
        break;
    }

    const statsQuery = `
      SELECT 
        COUNT(*) as total_alerts,
        COUNT(CASE WHEN status = 'PROCESSED' THEN 1 END) as processed_alerts,
        COUNT(CASE WHEN status = 'PENDING' THEN 1 END) as pending_alerts,
        COUNT(CASE WHEN status = 'ERROR' THEN 1 END) as error_alerts,
        COUNT(CASE WHEN status = 'IGNORED' THEN 1 END) as ignored_alerts,
        COUNT(CASE WHEN action = 'BUY' THEN 1 END) as buy_alerts,
        COUNT(CASE WHEN action = 'SELL' THEN 1 END) as sell_alerts
      FROM alerts 
      WHERE user_id = $1 ${dateFilter}
    `;

    const result = await db.query(statsQuery, params);
    const stats = result.rows[0];

    // Get top symbols
    const symbolsQuery = `
      SELECT symbol, COUNT(*) as count
      FROM alerts 
      WHERE user_id = $1 ${dateFilter}
      GROUP BY symbol 
      ORDER BY count DESC 
      LIMIT 10
    `;

    const symbolsResult = await db.query(symbolsQuery, params);

    res.json({
      summary: {
        total: parseInt(stats.total_alerts),
        processed: parseInt(stats.processed_alerts),
        pending: parseInt(stats.pending_alerts),
        errors: parseInt(stats.error_alerts),
        ignored: parseInt(stats.ignored_alerts),
        buy: parseInt(stats.buy_alerts),
        sell: parseInt(stats.sell_alerts)
      },
      topSymbols: symbolsResult.rows
    });

  } catch (error) {
    logger.error('Alert stats error', { 
      error: error.message, 
      userId: req.user.id 
    });
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
