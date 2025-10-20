const { fyersModel } = require('fyers-api-v3');
const crypto = require('crypto');
const logger = require('../utils/logger');

class FyersAPI {
  constructor() {
    this.baseURL = process.env.FYERS_BASE_URL || 'https://api-t1.fyers.in';
    this.appId = process.env.FYERS_APP_ID;
    this.secretKey = process.env.FYERS_SECRET_KEY;
    this.redirectURI = process.env.FYERS_REDIRECT_URI;

    // Validate required config
    if (!this.appId) {
      throw new Error('FYERS_APP_ID environment variable is not set');
    }
    if (!this.secretKey) {
      throw new Error('FYERS_SECRET_KEY environment variable is not set');
    }
    if (!this.redirectURI) {
      throw new Error('FYERS_REDIRECT_URI environment variable is not set');
    }

    // Initialize SDK
    this.fyers = new fyersModel({
      path: process.env.FYERS_LOG_PATH || 'logs',
      enableLogging: process.env.FYERS_ENABLE_LOGGING === 'true'
    });

    this.fyers.setAppId(this.appId);
    this.fyers.setRedirectUrl(this.redirectURI);

    logger.info('Fyers SDK initialized successfully');
  }

  // Generate authorization URL for OAuth flow
  generateAuthURL() {
    try {
      const url = this.fyers.generateAuthCode();
      const state = crypto.randomBytes(16).toString('hex');
      
      logger.info('Generated auth URL', { url });
      return { url, state };
    } catch (error) {
      logger.error('Error generating auth URL', { error: error.message });
      throw error;
    }
  }

  // Exchange authorization code for access token
  async getAccessToken(authCode) {
    try {
      logger.info('Exchanging auth code for access token');

      const response = await this.fyers.generate_access_token({
        client_id: this.appId,
        secret_key: this.secretKey,
        auth_code: authCode
      });

      logger.info('Token exchange response', {
        success: response?.s === 'ok',
        hasAccessToken: !!response?.access_token
      });

      if (response?.s === 'ok') {
        return {
          accessToken: response.access_token,
          refreshToken: response.refresh_token,
          expiresIn: response.expires_in
        };
      } else {
        throw new Error(response?.message || 'Failed to get access token');
      }
    } catch (error) {
      logger.error('Token exchange error', {
        error: error.message,
        response: error.response?.data
      });
      throw error;
    }
  }

  // Set access token for API calls
  setAccessToken(accessToken) {
    this.fyers.setAccessToken(accessToken);
  }

  // Get user profile
  async getProfile(accessToken) {
    try {
      this.setAccessToken(accessToken);
      const response = await this.fyers.get_profile();

      if (response?.s === 'ok') {
        return response.data || response;
      } else {
        throw new Error(response?.message || 'Failed to get profile');
      }
    } catch (error) {
      logger.error('Profile fetch error', { error: error.message });
      throw error;
    }
  }

  // Get account balance
  async getBalance(accessToken) {
    try {
      this.setAccessToken(accessToken);
      const response = await this.fyers.get_funds();

      if (response?.s === 'ok') {
        return response.fund_limit || response.data || response;
      } else {
        throw new Error(response?.message || 'Failed to get balance');
      }
    } catch (error) {
      logger.error('Balance fetch error', { error: error.message });
      throw error;
    }
  }

  // Get positions
  async getPositions(accessToken) {
    try {
      this.setAccessToken(accessToken);
      const response = await this.fyers.get_positions();

      if (response?.s === 'ok') {
        return response.netPositions || response.data || response;
      } else {
        throw new Error(response?.message || 'Failed to get positions');
      }
    } catch (error) {
      logger.error('Positions fetch error', { error: error.message });
      throw error;
    }
  }

  // Get quotes
  async getQuotes(accessToken, symbols) {
    try {
      this.setAccessToken(accessToken);
      const symbolList = Array.isArray(symbols) ? symbols : [symbols];
      const response = await this.fyers.getQuotes(symbolList);

      if (response?.s === 'ok') {
        return response.d || response.data || response;
      } else {
        throw new Error(response?.message || 'Failed to get quotes');
      }
    } catch (error) {
      logger.error('Quotes fetch error', { error: error.message });
      throw error;
    }
  }

  // Get market depth
  async getMarketDepth(accessToken, symbol) {
    try {
      this.setAccessToken(accessToken);
      const response = await this.fyers.getMarketDepth({
        symbol: Array.isArray(symbol) ? symbol : [symbol],
        ohlcv_flag: 1
      });

      if (response?.s === 'ok') {
        return response.d || response.data || response;
      } else {
        throw new Error(response?.message || 'Failed to get market depth');
      }
    } catch (error) {
      logger.error('Market depth fetch error', { error: error.message });
      throw error;
    }
  }

  // Place order
  async placeOrder(accessToken, orderData) {
    try {
      this.setAccessToken(accessToken);
      const validatedOrder = this.validateOrderData(orderData);
      
      const response = await this.fyers.place_order(validatedOrder);

      if (response?.s === 'ok') {
        logger.info('Order placed successfully', {
          orderId: response.id,
          symbol: orderData.symbol
        });
        return response;
      } else {
        throw new Error(response?.message || 'Failed to place order');
      }
    } catch (error) {
      logger.error('Order placement error', {
        error: error.message,
        symbol: orderData?.symbol
      });
      throw error;
    }
  }

  // Validate and format order data
  validateOrderData(orderData) {
    const required = ['symbol', 'qty', 'type', 'side'];

    for (const field of required) {
      if (!orderData[field]) {
        throw new Error(`Missing required field: ${field}`);
      }
    }

    // Format symbol if needed
    const symbol = this.formatSymbol(orderData.symbol);

    return {
      symbol: symbol,
      qty: parseInt(orderData.qty),
      type: this.getOrderType(orderData.type),
      side: orderData.side === 'BUY' ? 1 : -1,
      productType: orderData.productType || 'INTRADAY',
      limitPrice: orderData.limitPrice || 0,
      stopPrice: orderData.stopPrice || 0,
      validity: orderData.validity || 'DAY',
      disclosedQty: orderData.disclosedQty || 0,
      offlineOrder: orderData.offlineOrder || false,
      stopLoss: orderData.stopLoss || 0,
      takeProfit: orderData.takeProfit || 0
    };
  }

  // Convert order type to Fyers format
  getOrderType(type) {
    const typeMap = {
      'LIMIT': 1,
      'MARKET': 2,
      'STOP_MARKET': 3, // SL-M
      'STOP_LIMIT': 4   // SL-L
    };
    return typeMap[type] || 2; // Default to MARKET
  }

  // Format symbol for Fyers API
  formatSymbol(symbol) {
    // If symbol already has exchange prefix, return as is
    if (symbol.includes(':')) {
      return symbol;
    }
    
    // Default to NSE equity
    return `NSE:${symbol}-EQ`;
  }

  // Get order book
  async getOrderBook(accessToken) {
    try {
      this.setAccessToken(accessToken);
      const response = await this.fyers.get_orders();

      if (response?.s === 'ok') {
        return response.orderBook || response.data || response;
      } else {
        throw new Error(response?.message || 'Failed to get order book');
      }
    } catch (error) {
      logger.error('Order book fetch error', { error: error.message });
      throw error;
    }
  }

  // Cancel order
  async cancelOrder(accessToken, orderId) {
    try {
      this.setAccessToken(accessToken);
      const response = await this.fyers.cancel_order({ id: orderId });

      if (response?.s === 'ok') {
        logger.info('Order cancelled successfully', { orderId });
        return response;
      } else {
        throw new Error(response?.message || 'Failed to cancel order');
      }
    } catch (error) {
      logger.error('Order cancellation error', {
        error: error.message,
        orderId
      });
      throw error;
    }
  }

  // Modify order
  async modifyOrder(accessToken, orderId, modifyData) {
    try {
      this.setAccessToken(accessToken);
      const response = await this.fyers.modify_order({
        id: orderId,
        ...modifyData
      });

      if (response?.s === 'ok') {
        logger.info('Order modified successfully', { orderId });
        return response;
      } else {
        throw new Error(response?.message || 'Failed to modify order');
      }
    } catch (error) {
      logger.error('Order modification error', {
        error: error.message,
        orderId
      });
      throw error;
    }
  }

  // Get holdings
  async getHoldings(accessToken) {
    try {
      this.setAccessToken(accessToken);
      const response = await this.fyers.get_holdings();

      if (response?.s === 'ok') {
        return response.holdings || response.data || response;
      } else {
        throw new Error(response?.message || 'Failed to get holdings');
      }
    } catch (error) {
      logger.error('Holdings fetch error', { error: error.message });
      throw error;
    }
  }

  // Get tradebook
  async getTradeBook(accessToken) {
    try {
      this.setAccessToken(accessToken);
      const response = await this.fyers.get_tradebook();

      if (response?.s === 'ok') {
        return response.tradeBook || response.data || response;
      } else {
        throw new Error(response?.message || 'Failed to get tradebook');
      }
    } catch (error) {
      logger.error('Tradebook fetch error', { error: error.message });
      throw error;
    }
  }

  // Convert position
  async convertPosition(accessToken, positionData) {
    try {
      this.setAccessToken(accessToken);
      const response = await this.fyers.convert_position(positionData);

      if (response?.s === 'ok') {
        logger.info('Position converted successfully');
        return response;
      } else {
        throw new Error(response?.message || 'Failed to convert position');
      }
    } catch (error) {
      logger.error('Position conversion error', { error: error.message });
      throw error;
    }
  }

  // Exit position
  async exitPosition(accessToken, positionId) {
    try {
      this.setAccessToken(accessToken);
      const response = await this.fyers.exit_positions({ id: positionId });

      if (response?.s === 'ok') {
        logger.info('Position exited successfully', { positionId });
        return response;
      } else {
        throw new Error(response?.message || 'Failed to exit position');
      }
    } catch (error) {
      logger.error('Position exit error', {
        error: error.message,
        positionId
      });
      throw error;
    }
  }

  // Get historical data
  async getHistoricalData(accessToken, params) {
    try {
      this.setAccessToken(accessToken);
      const response = await this.fyers.get_history({
        symbol: params.symbol,
        resolution: params.resolution, // "1", "5", "15", "D", "W", "M"
        date_format: params.dateFormat || 1, // 0 for UNIX, 1 for dd-MM-yyyy
        range_from: params.rangeFrom,
        range_to: params.rangeTo,
        cont_flag: params.contFlag || 1
      });

      if (response?.s === 'ok') {
        return response.candles || response.data || response;
      } else {
        throw new Error(response?.message || 'Failed to get historical data');
      }
    } catch (error) {
      logger.error('Historical data fetch error', { error: error.message });
      throw error;
    }
  }

  // Get market status
  async getMarketStatus(accessToken) {
    try {
      this.setAccessToken(accessToken);
      const response = await this.fyers.get_market_status();

      if (response?.s === 'ok') {
        return response.marketStatus || response.data || response;
      } else {
        throw new Error(response?.message || 'Failed to get market status');
      }
    } catch (error) {
      logger.error('Market status fetch error', { error: error.message });
      throw error;
    }
  }

  // Logout user
  async logout(accessToken) {
    try {
      this.setAccessToken(accessToken);
      const response = await this.fyers.logout();

      if (response?.s === 'ok') {
        logger.info('User logged out successfully');
        return response;
      } else {
        throw new Error(response?.message || 'Failed to logout');
      }
    } catch (error) {
      logger.error('Logout error', { error: error.message });
      throw error;
    }
  }
}

module.exports = FyersAPI;