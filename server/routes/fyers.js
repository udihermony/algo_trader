const express = require('express');
const fyersAPI = require('../services/fyersAPI');
const db = require('../config/database');
const logger = require('../utils/logger');

const router = express.Router();

// Connect Fyers account
router.post('/connect', async (req, res) => {
  try {
    const { authCode } = req.body;

    if (!authCode) {
      return res.status(400).json({ error: 'Authorization code is required' });
    }

    // Exchange auth code for access token
    const tokens = await fyersAPI.getAccessToken(authCode);

    // Encrypt and store credentials
    const encryptedCredentials = JSON.stringify(tokens);

    // Update or create settings record
    await db.query(
      `INSERT INTO settings (user_id, fyers_credentials)
       VALUES ($1, $2)
       ON CONFLICT (user_id) 
       DO UPDATE SET fyers_credentials = $2, updated_at = CURRENT_TIMESTAMP`,
      [req.user.id, encryptedCredentials]
    );

    logger.info('Fyers account connected', { userId: req.user.id });

    res.json({
      message: 'Fyers account connected successfully',
      expiresIn: tokens.expiresIn
    });

  } catch (error) {
    logger.error('Fyers connection error', { 
      error: error.message, 
      userId: req.user.id 
    });
    res.status(500).json({ error: 'Failed to connect Fyers account' });
  }
});

// Get authorization URL
router.get('/auth-url', (req, res) => {
  try {
    const authData = fyersAPI.generateAuthURL();
    
    res.json({
      authUrl: authData.url,
      state: authData.state
    });
  } catch (error) {
    logger.error('Auth URL generation error', { error: error.message });
    res.status(500).json({ error: 'Failed to generate auth URL' });
  }
});

// Get account balance
router.get('/balance', async (req, res) => {
  try {
    const credentials = await getUserCredentials(req.user.id);
    
    if (!credentials) {
      return res.status(400).json({ error: 'Fyers account not connected' });
    }

    const balance = await fyersAPI.getBalance(credentials.accessToken);
    
    res.json(balance);
  } catch (error) {
    logger.error('Balance fetch error', { 
      error: error.message, 
      userId: req.user.id 
    });
    res.status(500).json({ error: 'Failed to fetch balance' });
  }
});

// Get positions
router.get('/positions', async (req, res) => {
  try {
    const credentials = await getUserCredentials(req.user.id);
    
    if (!credentials) {
      return res.status(400).json({ error: 'Fyers account not connected' });
    }

    const positions = await fyersAPI.getPositions(credentials.accessToken);
    
    res.json(positions);
  } catch (error) {
    logger.error('Positions fetch error', { 
      error: error.message, 
      userId: req.user.id 
    });
    res.status(500).json({ error: 'Failed to fetch positions' });
  }
});

// Get order book
router.get('/orders', async (req, res) => {
  try {
    const credentials = await getUserCredentials(req.user.id);
    
    if (!credentials) {
      return res.status(400).json({ error: 'Fyers account not connected' });
    }

    const orders = await fyersAPI.getOrderBook(credentials.accessToken);
    
    res.json(orders);
  } catch (error) {
    logger.error('Order book fetch error', { 
      error: error.message, 
      userId: req.user.id 
    });
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

// Place manual order
router.post('/orders', async (req, res) => {
  try {
    const { symbol, side, qty, type, limitPrice, stopPrice } = req.body;

    if (!symbol || !side || !qty || !type) {
      return res.status(400).json({ 
        error: 'Missing required fields: symbol, side, qty, type' 
      });
    }

    const credentials = await getUserCredentials(req.user.id);
    
    if (!credentials) {
      return res.status(400).json({ error: 'Fyers account not connected' });
    }

    const orderData = {
      symbol,
      side,
      qty: parseInt(qty),
      type,
      limitPrice: limitPrice ? parseFloat(limitPrice) : undefined,
      stopPrice: stopPrice ? parseFloat(stopPrice) : undefined
    };

    const fyersResponse = await fyersAPI.placeOrder(credentials.accessToken, orderData);

    // Store order in database
    const result = await db.query(
      `INSERT INTO orders (user_id, symbol, side, quantity, order_type, price, status, fyers_order_id, fyers_response)
       VALUES ($1, $2, $3, $4, $5, $6, 'SUBMITTED', $7, $8)
       RETURNING id`,
      [
        req.user.id,
        symbol,
        side,
        qty,
        type,
        limitPrice,
        fyersResponse.id,
        JSON.stringify(fyersResponse)
      ]
    );

    logger.info('Manual order placed', {
      userId: req.user.id,
      orderId: result.rows[0].id,
      fyersOrderId: fyersResponse.id,
      symbol,
      side,
      qty
    });

    res.json({
      orderId: result.rows[0].id,
      fyersOrderId: fyersResponse.id,
      status: 'SUBMITTED'
    });

  } catch (error) {
    logger.error('Manual order placement error', { 
      error: error.message, 
      userId: req.user.id,
      orderData: req.body
    });
    res.status(500).json({ error: 'Failed to place order' });
  }
});

// Modify order
router.put('/orders/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;
    const { limitPrice, stopPrice, qty } = req.body;

    const credentials = await getUserCredentials(req.user.id);
    
    if (!credentials) {
      return res.status(400).json({ error: 'Fyers account not connected' });
    }

    // Get order from database
    const orderResult = await db.query(
      'SELECT * FROM orders WHERE id = $1 AND user_id = $2',
      [orderId, req.user.id]
    );

    if (orderResult.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const order = orderResult.rows[0];

    if (!order.fyers_order_id) {
      return res.status(400).json({ error: 'Fyers order ID not found' });
    }

    const modifyData = {};
    if (limitPrice !== undefined) modifyData.limitPrice = limitPrice;
    if (stopPrice !== undefined) modifyData.stopPrice = stopPrice;
    if (qty !== undefined) modifyData.qty = qty;

    const fyersResponse = await fyersAPI.modifyOrder(
      credentials.accessToken, 
      order.fyers_order_id, 
      modifyData
    );

    // Update order in database
    await db.query(
      'UPDATE orders SET updated_at = CURRENT_TIMESTAMP WHERE id = $1',
      [orderId]
    );

    logger.info('Order modified', {
      userId: req.user.id,
      orderId,
      fyersOrderId: order.fyers_order_id,
      modifyData
    });

    res.json({
      message: 'Order modified successfully',
      fyersResponse
    });

  } catch (error) {
    logger.error('Order modification error', { 
      error: error.message, 
      userId: req.user.id,
      orderId: req.params.orderId
    });
    res.status(500).json({ error: 'Failed to modify order' });
  }
});

// Cancel order
router.delete('/orders/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;

    const credentials = await getUserCredentials(req.user.id);
    
    if (!credentials) {
      return res.status(400).json({ error: 'Fyers account not connected' });
    }

    // Get order from database
    const orderResult = await db.query(
      'SELECT * FROM orders WHERE id = $1 AND user_id = $2',
      [orderId, req.user.id]
    );

    if (orderResult.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const order = orderResult.rows[0];

    if (!order.fyers_order_id) {
      return res.status(400).json({ error: 'Fyers order ID not found' });
    }

    const fyersResponse = await fyersAPI.cancelOrder(
      credentials.accessToken, 
      order.fyers_order_id
    );

    // Update order status in database
    await db.query(
      'UPDATE orders SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      ['CANCELLED', orderId]
    );

    logger.info('Order cancelled', {
      userId: req.user.id,
      orderId,
      fyersOrderId: order.fyers_order_id
    });

    res.json({
      message: 'Order cancelled successfully',
      fyersResponse
    });

  } catch (error) {
    logger.error('Order cancellation error', { 
      error: error.message, 
      userId: req.user.id,
      orderId: req.params.orderId
    });
    res.status(500).json({ error: 'Failed to cancel order' });
  }
});

// Get market data
router.get('/market-data', async (req, res) => {
  try {
    const { symbols } = req.query;

    if (!symbols) {
      return res.status(400).json({ error: 'Symbols parameter is required' });
    }

    const credentials = await getUserCredentials(req.user.id);
    
    if (!credentials) {
      return res.status(400).json({ error: 'Fyers account not connected' });
    }

    const symbolList = symbols.split(',');
    const marketData = await fyersAPI.getMarketData(credentials.accessToken, symbolList);
    
    res.json(marketData);
  } catch (error) {
    logger.error('Market data fetch error', { 
      error: error.message, 
      userId: req.user.id 
    });
    res.status(500).json({ error: 'Failed to fetch market data' });
  }
});

// Helper function to get user credentials
async function getUserCredentials(userId) {
  const result = await db.query(
    'SELECT fyers_credentials FROM settings WHERE user_id = $1',
    [userId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  const encryptedCredentials = result.rows[0].fyers_credentials;
  
  if (!encryptedCredentials) {
    return null;
  }

  try {
    return JSON.parse(encryptedCredentials);
  } catch (error) {
    logger.error('Failed to parse credentials', { error: error.message });
    return null;
  }
}

module.exports = router;
