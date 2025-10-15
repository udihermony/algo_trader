const db = require('../config/database');
const logger = require('../utils/logger');
const fyersAPI = require('./fyersAPI');

async function processAlert(userId, alertId, alertData) {
  try {
    // Read auto execute and credentials
    const settingsResult = await db.query(
      'SELECT auto_execute_enabled, fyers_credentials FROM settings WHERE user_id = $1',
      [userId]
    );

    const settings = settingsResult.rows[0];
    const autoExecute = settings?.auto_execute_enabled === true;
    const credentials = settings?.fyers_credentials ? JSON.parse(settings.fyers_credentials) : null;

    if (!autoExecute || !credentials?.accessToken) {
      logger.info('Auto execute disabled or no FYERS token; skipping order placement', { userId, alertId });
      return { skipped: true };
    }

    const orderData = {
      symbol: alertData.symbol,
      qty: alertData.quantity || 1,
      side: alertData.action === 'SELL' ? 'SELL' : 'BUY',
      type: 1, // Market
      productType: 'INTRADAY'
    };

    const fyersOrder = await fyersAPI.placeOrder(credentials.accessToken, orderData);

    await db.query(
      `INSERT INTO orders (user_id, alert_id, symbol, side, quantity, order_type, status, fyers_order_id, fyers_response)
       VALUES ($1, $2, $3, $4, $5, $6, 'SUBMITTED', $7, $8)`,
      [userId, alertId, orderData.symbol, orderData.side, orderData.qty, 'MARKET', fyersOrder.id, JSON.stringify(fyersOrder)]
    );

    logger.info('Auto order submitted', { userId, alertId, fyersOrderId: fyersOrder.id });
    return { submitted: true, fyersOrderId: fyersOrder.id };
  } catch (error) {
    logger.error('Auto order placement failed', { userId, alertId, error: error.message });
    throw error;
  }
}

module.exports = { processAlert };

const db = require('../config/database');
const fyersAPI = require('./fyersAPI');
const logger = require('../utils/logger');
const crypto = require('crypto');

class OrderExecutionService {
  constructor() {
    this.isProcessing = false;
  }

  // Process incoming alert and execute trades
  async processAlert(userId, alertId, alertData) {
    try {
      // Get user's active strategies
      const strategies = await this.getActiveStrategies(userId);
      
      if (strategies.length === 0) {
        logger.info('No active strategies found for user', { userId });
        await this.updateAlertStatus(alertId, 'IGNORED', 'No active strategies');
        return;
      }

      // Process alert for each strategy
      for (const strategy of strategies) {
        try {
          await this.processAlertForStrategy(userId, alertId, alertData, strategy);
        } catch (strategyError) {
          logger.error('Error processing alert for strategy', {
            userId,
            alertId,
            strategyId: strategy.id,
            error: strategyError.message
          });
        }
      }

    } catch (error) {
      logger.error('Alert processing error', {
        userId,
        alertId,
        error: error.message
      });
      await this.updateAlertStatus(alertId, 'ERROR', error.message);
    }
  }

  // Process alert for a specific strategy
  async processAlertForStrategy(userId, alertId, alertData, strategy) {
    const config = strategy.config;
    
    // Check if symbol is allowed in this strategy
    if (!this.isSymbolAllowed(alertData.symbol, config)) {
      logger.info('Symbol not allowed in strategy', {
        symbol: alertData.symbol,
        strategyId: strategy.id
      });
      return;
    }

    // Check trading hours
    if (!this.isWithinTradingHours(config)) {
      logger.info('Outside trading hours', { strategyId: strategy.id });
      return;
    }

    // Apply risk management checks
    const riskCheck = await this.performRiskChecks(userId, alertData, config);
    if (!riskCheck.allowed) {
      logger.warn('Risk check failed', {
        userId,
        strategyId: strategy.id,
        reason: riskCheck.reason
      });
      return;
    }

    // Generate order parameters
    const orderParams = await this.generateOrderParams(userId, alertData, config);
    
    if (!orderParams) {
      logger.info('No order generated', { strategyId: strategy.id });
      return;
    }

    // Execute the order
    await this.executeOrder(userId, alertId, strategy.id, orderParams);

  }

  // Get active strategies for user
  async getActiveStrategies(userId) {
    const result = await db.query(
      'SELECT * FROM strategies WHERE user_id = $1 AND is_active = true',
      [userId]
    );
    return result.rows;
  }

  // Check if symbol is allowed in strategy
  isSymbolAllowed(symbol, config) {
    const allowedSymbols = config.allowedSymbols || [];
    const blockedSymbols = config.blockedSymbols || [];

    if (blockedSymbols.includes(symbol)) {
      return false;
    }

    if (allowedSymbols.length > 0 && !allowedSymbols.includes(symbol)) {
      return false;
    }

    return true;
  }

  // Check if within trading hours
  isWithinTradingHours(config) {
    const tradingHours = config.tradingHours || {};
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    const currentTime = currentHour * 60 + currentMinute;

    const startTime = tradingHours.startTime || '09:15';
    const endTime = tradingHours.endTime || '15:30';

    const [startHour, startMin] = startTime.split(':').map(Number);
    const [endHour, endMin] = endTime.split(':').map(Number);

    const startMinutes = startHour * 60 + startMin;
    const endMinutes = endHour * 60 + endMin;

    return currentTime >= startMinutes && currentTime <= endMinutes;
  }

  // Perform risk management checks
  async performRiskChecks(userId, alertData, config) {
    const riskParams = config.riskParams || {};

    // Check maximum positions
    const maxPositions = riskParams.maxPositions || 10;
    const currentPositions = await this.getActivePositionsCount(userId);
    
    if (currentPositions >= maxPositions) {
      return { allowed: false, reason: 'Maximum positions limit reached' };
    }

    // Check daily loss limit
    const dailyLossLimit = riskParams.dailyLossLimit || 10000;
    const todayPnL = await this.getTodayPnL(userId);
    
    if (todayPnL <= -dailyLossLimit) {
      return { allowed: false, reason: 'Daily loss limit reached' };
    }

    // Check position size limits
    const maxPositionSize = riskParams.maxPositionSize || 100000;
    const positionValue = alertData.price * alertData.quantity;
    
    if (positionValue > maxPositionSize) {
      return { allowed: false, reason: 'Position size exceeds limit' };
    }

    return { allowed: true };
  }

  // Get count of active positions
  async getActivePositionsCount(userId) {
    const result = await db.query(
      'SELECT COUNT(*) FROM positions WHERE user_id = $1 AND is_active = true',
      [userId]
    );
    return parseInt(result.rows[0].count);
  }

  // Get today's P&L
  async getTodayPnL(userId) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const result = await db.query(
      `SELECT COALESCE(SUM(realized_pnl), 0) as total_pnl
       FROM trades 
       WHERE user_id = $1 AND executed_at >= $2`,
      [userId, today]
    );
    
    return parseFloat(result.rows[0].total_pnl);
  }

  // Generate order parameters
  async generateOrderParams(userId, alertData, config) {
    const orderParams = {
      symbol: alertData.symbol,
      side: alertData.action,
      qty: alertData.quantity || config.defaultQuantity || 1,
      type: config.orderType || 'MARKET',
      productType: config.productType || 'INTRADAY'
    };

    // Set limit price if order type is LIMIT
    if (orderParams.type === 'LIMIT') {
      orderParams.limitPrice = alertData.price;
    }

    // Set stop loss if configured
    if (config.stopLoss && alertData.action === 'BUY') {
      orderParams.stopPrice = alertData.price * (1 - config.stopLoss / 100);
    }

    return orderParams;
  }

  // Execute order via Fyers API
  async executeOrder(userId, alertId, strategyId, orderParams) {
    try {
      // Get user's Fyers credentials
      const credentials = await this.getUserCredentials(userId);
      
      if (!credentials || !credentials.accessToken) {
        throw new Error('Fyers credentials not found');
      }

      // Create order record
      const orderResult = await db.query(
        `INSERT INTO orders (user_id, strategy_id, alert_id, symbol, side, quantity, order_type, price, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'PENDING')
         RETURNING id`,
        [
          userId,
          strategyId,
          alertId,
          orderParams.symbol,
          orderParams.side,
          orderParams.qty,
          orderParams.type,
          orderParams.limitPrice || orderParams.stopPrice
        ]
      );

      const orderId = orderResult.rows[0].id;

      // Place order with Fyers
      const fyersResponse = await fyersAPI.placeOrder(credentials.accessToken, orderParams);

      // Update order with Fyers response
      await db.query(
        `UPDATE orders 
         SET fyers_order_id = $1, fyers_response = $2, status = 'SUBMITTED'
         WHERE id = $3`,
        [
          fyersResponse.id,
          JSON.stringify(fyersResponse),
          orderId
        ]
      );

      logger.info('Order executed successfully', {
        userId,
        orderId,
        fyersOrderId: fyersResponse.id,
        symbol: orderParams.symbol,
        side: orderParams.side,
        quantity: orderParams.qty
      });

      // Update alert status
      await this.updateAlertStatus(alertId, 'PROCESSED', 'Order placed successfully');

      return {
        orderId,
        fyersOrderId: fyersResponse.id,
        status: 'SUBMITTED'
      };

    } catch (error) {
      logger.error('Order execution error', {
        userId,
        alertId,
        strategyId,
        orderParams,
        error: error.message
      });

      // Update alert status
      await this.updateAlertStatus(alertId, 'ERROR', error.message);

      throw error;
    }
  }

  // Get user's encrypted Fyers credentials
  async getUserCredentials(userId) {
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

    // Decrypt credentials (implement your encryption logic)
    return this.decryptCredentials(encryptedCredentials);
  }

  // Decrypt credentials (implement proper encryption)
  decryptCredentials(encryptedData) {
    // This is a placeholder - implement proper encryption/decryption
    // For now, assuming credentials are stored as plain JSON (NOT RECOMMENDED FOR PRODUCTION)
    try {
      return JSON.parse(encryptedData);
    } catch (error) {
      logger.error('Failed to decrypt credentials', { error: error.message });
      return null;
    }
  }

  // Update alert status
  async updateAlertStatus(alertId, status, message = null) {
    await db.query(
      'UPDATE alerts SET status = $1, processed_at = $2 WHERE id = $3',
      [status, new Date(), alertId]
    );

    if (message) {
      logger.info('Alert status updated', { alertId, status, message });
    }
  }

  // Monitor order status
  async monitorOrderStatus(orderId) {
    try {
      const order = await db.query(
        'SELECT * FROM orders WHERE id = $1',
        [orderId]
      );

      if (order.rows.length === 0) {
        throw new Error('Order not found');
      }

      const orderData = order.rows[0];
      
      if (!orderData.fyers_order_id) {
        return orderData;
      }

      // Get user credentials
      const credentials = await this.getUserCredentials(orderData.user_id);
      
      if (!credentials) {
        throw new Error('User credentials not found');
      }

      // Get order status from Fyers
      const orderBook = await fyersAPI.getOrderBook(credentials.accessToken);
      const fyersOrder = orderBook.find(o => o.id === orderData.fyers_order_id);

      if (fyersOrder) {
        // Update order status
        await db.query(
          'UPDATE orders SET status = $1, updated_at = $2 WHERE id = $3',
          [fyersOrder.status, new Date(), orderId]
        );

        // If order is filled, create trade record
        if (fyersOrder.status === 'FILLED') {
          await this.createTradeRecord(orderData, fyersOrder);
        }
      }

      return orderData;

    } catch (error) {
      logger.error('Order monitoring error', { orderId, error: error.message });
      throw error;
    }
  }

  // Create trade record when order is filled
  async createTradeRecord(orderData, fyersOrder) {
    try {
      await db.query(
        `INSERT INTO trades (user_id, order_id, symbol, side, quantity, price, charges, executed_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          orderData.user_id,
          orderData.id,
          orderData.symbol,
          orderData.side,
          fyersOrder.filledQty,
          fyersOrder.avgPrice,
          fyersOrder.charges || 0,
          new Date()
        ]
      );

      logger.info('Trade record created', {
        orderId: orderData.id,
        symbol: orderData.symbol,
        quantity: fyersOrder.filledQty,
        price: fyersOrder.avgPrice
      });

    } catch (error) {
      logger.error('Trade record creation error', { error: error.message });
    }
  }
}

module.exports = new OrderExecutionService();
