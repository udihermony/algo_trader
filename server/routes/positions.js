const express = require('express');
const db = require('../config/database');
const logger = require('../utils/logger');

const router = express.Router();

// Get positions
router.get('/', async (req, res) => {
  try {
    const { active = true } = req.query;

    let query = `
      SELECT * FROM positions 
      WHERE user_id = $1
    `;
    
    const params = [req.user.id];

    if (active === 'true') {
      query += ' AND is_active = true';
    }

    query += ' ORDER BY opened_at DESC';

    const result = await db.query(query, params);

    res.json(result.rows);

  } catch (error) {
    logger.error('Positions fetch error', { 
      error: error.message, 
      userId: req.user.id 
    });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get position by symbol
router.get('/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;

    const result = await db.query(
      'SELECT * FROM positions WHERE user_id = $1 AND symbol = $2',
      [req.user.id, symbol]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Position not found' });
    }

    res.json(result.rows[0]);

  } catch (error) {
    logger.error('Position fetch error', { 
      error: error.message, 
      userId: req.user.id,
      symbol: req.params.symbol
    });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Close position manually
router.post('/:symbol/close', async (req, res) => {
  try {
    const { symbol } = req.params;
    const { quantity, price } = req.body;

    if (!quantity || !price) {
      return res.status(400).json({ 
        error: 'Quantity and price are required' 
      });
    }

    // Get current position
    const positionResult = await db.query(
      'SELECT * FROM positions WHERE user_id = $1 AND symbol = $2 AND is_active = true',
      [req.user.id, symbol]
    );

    if (positionResult.rows.length === 0) {
      return res.status(404).json({ error: 'Active position not found' });
    }

    const position = positionResult.rows[0];

    if (quantity > position.quantity) {
      return res.status(400).json({ 
        error: 'Quantity exceeds position size' 
      });
    }

    // Calculate P&L
    const pnl = (price - position.avg_price) * quantity;
    const side = position.quantity > 0 ? 'SELL' : 'BUY';

    // Create trade record
    const tradeResult = await db.query(
      `INSERT INTO trades (user_id, symbol, side, quantity, price, pnl, executed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [
        req.user.id,
        symbol,
        side,
        quantity,
        price,
        pnl,
        new Date()
      ]
    );

    // Update position
    const newQuantity = position.quantity - (side === 'SELL' ? quantity : -quantity);
    const newRealizedPnL = position.realized_pnl + pnl;

    if (newQuantity === 0) {
      // Close position completely
      await db.query(
        `UPDATE positions 
         SET quantity = 0, realized_pnl = $1, is_active = false, closed_at = $2
         WHERE user_id = $3 AND symbol = $4`,
        [newRealizedPnL, new Date(), req.user.id, symbol]
      );
    } else {
      // Partial close
      await db.query(
        `UPDATE positions 
         SET quantity = $1, realized_pnl = $2
         WHERE user_id = $3 AND symbol = $4`,
        [newQuantity, newRealizedPnL, req.user.id, symbol]
      );
    }

    logger.info('Position closed manually', {
      userId: req.user.id,
      symbol,
      quantity,
      price,
      pnl,
      tradeId: tradeResult.rows[0].id
    });

    res.json({
      message: 'Position closed successfully',
      tradeId: tradeResult.rows[0].id,
      pnl: pnl,
      remainingQuantity: newQuantity
    });

  } catch (error) {
    logger.error('Position close error', { 
      error: error.message, 
      userId: req.user.id,
      symbol: req.params.symbol
    });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get position statistics
router.get('/stats/summary', async (req, res) => {
  try {
    const statsQuery = `
      SELECT 
        COUNT(*) as total_positions,
        COUNT(CASE WHEN is_active = true THEN 1 END) as active_positions,
        COUNT(CASE WHEN is_active = false THEN 1 END) as closed_positions,
        COALESCE(SUM(unrealized_pnl), 0) as total_unrealized_pnl,
        COALESCE(SUM(realized_pnl), 0) as total_realized_pnl,
        COALESCE(SUM(CASE WHEN is_active = true THEN unrealized_pnl END), 0) as active_unrealized_pnl
      FROM positions 
      WHERE user_id = $1
    `;

    const result = await db.query(statsQuery, [req.user.id]);
    const stats = result.rows[0];

    // Get top performing positions
    const topPositionsQuery = `
      SELECT symbol, realized_pnl, unrealized_pnl, is_active
      FROM positions 
      WHERE user_id = $1
      ORDER BY (realized_pnl + COALESCE(unrealized_pnl, 0)) DESC
      LIMIT 10
    `;

    const topPositionsResult = await db.query(topPositionsQuery, [req.user.id]);

    res.json({
      summary: {
        total: parseInt(stats.total_positions),
        active: parseInt(stats.active_positions),
        closed: parseInt(stats.closed_positions),
        totalUnrealizedPnL: parseFloat(stats.total_unrealized_pnl),
        totalRealizedPnL: parseFloat(stats.total_realized_pnl),
        activeUnrealizedPnL: parseFloat(stats.active_unrealized_pnl)
      },
      topPositions: topPositionsResult.rows
    });

  } catch (error) {
    logger.error('Position stats error', { 
      error: error.message, 
      userId: req.user.id 
    });
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
