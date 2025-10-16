const axios = require('axios');
const crypto = require('crypto');
const logger = require('../utils/logger');

class FyersAPI {
  constructor() {
    this.baseURL = process.env.FYERS_BASE_URL || 'https://api.fyers.in';
    this.appId = process.env.FYERS_APP_ID;
    this.secretKey = process.env.FYERS_SECRET_KEY;
    this.redirectURI = process.env.FYERS_REDIRECT_URI;
  }

  // Generate authorization URL for OAuth flow
  generateAuthURL() {
    const state = crypto.randomBytes(16).toString('hex');
    const params = new URLSearchParams({
      client_id: this.appId,
      redirect_uri: this.redirectURI,
      response_type: 'code',
      state: state,
      scope: 'read:profile read:portfolio write:portfolio'
    });

    return {
      url: `https://api.fyers.in/api/v2/generate-authcode?${params.toString()}`,
      state: state
    };
  }

  // Exchange authorization code for access token
  async getAccessToken(authCode) {
    try {
      const data = {
        grant_type: 'authorization_code',
        appIdHash: this.generateAppIdHash(),
        code: authCode
      };

      const response = await axios.post(`${this.baseURL}/api/v2/token`, data, {
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (response.data.s === 'ok') {
        return {
          accessToken: response.data.access_token,
          refreshToken: response.data.refresh_token,
          expiresIn: response.data.expires_in
        };
      } else {
        throw new Error(response.data.message || 'Failed to get access token');
      }
    } catch (error) {
      logger.error('Fyers token exchange error', { error: error.message });
      throw error;
    }
  }

  // Generate app ID hash for authentication
  generateAppIdHash() {
    const hash = crypto.createHash('sha256');
    hash.update(`${this.appId}:${this.secretKey}`);
    return hash.digest('hex');
  }

  // Create authenticated API client
  createClient(accessToken) {
    return axios.create({
      baseURL: this.baseURL,
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });
  }

  // Get user profile
  async getProfile(accessToken) {
    try {
      const client = this.createClient(accessToken);
      const response = await client.get('/api/v2/profile');
      
      if (response.data.s === 'ok') {
        return response.data.data;
      } else {
        throw new Error(response.data.message || 'Failed to get profile');
      }
    } catch (error) {
      logger.error('Fyers profile fetch error', { error: error.message });
      throw error;
    }
  }

  // Get account balance
  async getBalance(accessToken) {
    try {
      const client = this.createClient(accessToken);
      const response = await client.get('/api/v2/funds');
      
      if (response.data.s === 'ok') {
        return response.data.data;
      } else {
        throw new Error(response.data.message || 'Failed to get balance');
      }
    } catch (error) {
      logger.error('Fyers balance fetch error', { error: error.message });
      throw error;
    }
  }

  // Get positions
  async getPositions(accessToken) {
    try {
      const client = this.createClient(accessToken);
      const response = await client.get('/api/v2/positions');
      
      if (response.data.s === 'ok') {
        return response.data.data;
      } else {
        throw new Error(response.data.message || 'Failed to get positions');
      }
    } catch (error) {
      logger.error('Fyers positions fetch error', { error: error.message });
      throw error;
    }
  }

  // Place order
  async placeOrder(accessToken, orderData) {
    try {
      const client = this.createClient(accessToken);
      
      // Validate order data
      const validatedOrder = this.validateOrderData(orderData);
      
      const response = await client.post('/api/v2/orders', validatedOrder);
      
      if (response.data.s === 'ok') {
        logger.info('Order placed successfully', { 
          orderId: response.data.data.id,
          symbol: orderData.symbol,
          side: orderData.side,
          quantity: orderData.qty
        });
        return response.data.data;
      } else {
        throw new Error(response.data.message || 'Failed to place order');
      }
    } catch (error) {
      logger.error('Fyers order placement error', { 
        error: error.message,
        orderData: orderData
      });
      throw error;
    }
  }

  // Modify order
  async modifyOrder(accessToken, orderId, modifyData) {
    try {
      const client = this.createClient(accessToken);
      
      const response = await client.put(`/api/v2/orders/${orderId}`, modifyData);
      
      if (response.data.s === 'ok') {
        logger.info('Order modified successfully', { orderId });
        return response.data.data;
      } else {
        throw new Error(response.data.message || 'Failed to modify order');
      }
    } catch (error) {
      logger.error('Fyers order modification error', { 
        error: error.message,
        orderId,
        modifyData
      });
      throw error;
    }
  }

  // Cancel order
  async cancelOrder(accessToken, orderId) {
    try {
      const client = this.createClient(accessToken);
      
      const response = await client.delete(`/api/v2/orders/${orderId}`);
      
      if (response.data.s === 'ok') {
        logger.info('Order cancelled successfully', { orderId });
        return response.data.data;
      } else {
        throw new Error(response.data.message || 'Failed to cancel order');
      }
    } catch (error) {
      logger.error('Fyers order cancellation error', { 
        error: error.message,
        orderId
      });
      throw error;
    }
  }

  // Get order book
  async getOrderBook(accessToken) {
    try {
      const client = this.createClient(accessToken);
      const response = await client.get('/api/v2/orders');
      
      if (response.data.s === 'ok') {
        return response.data.data;
      } else {
        throw new Error(response.data.message || 'Failed to get order book');
      }
    } catch (error) {
      logger.error('Fyers order book fetch error', { error: error.message });
      throw error;
    }
  }

  // Get market data
  async getMarketData(accessToken, symbols) {
    try {
      const client = this.createClient(accessToken);
      const symbolsParam = Array.isArray(symbols) ? symbols.join(',') : symbols;
      
      const response = await client.get(`/api/v2/market-data?symbols=${symbolsParam}`);
      
      if (response.data.s === 'ok') {
        return response.data.data;
      } else {
        throw new Error(response.data.message || 'Failed to get market data');
      }
    } catch (error) {
      logger.error('Fyers market data fetch error', { error: error.message });
      throw error;
    }
  }

  // Validate order data
  validateOrderData(orderData) {
    const required = ['symbol', 'qty', 'type', 'side'];
    
    for (const field of required) {
      if (!orderData[field]) {
        throw new Error(`Missing required field: ${field}`);
      }
    }

    // Convert symbol format if needed
    const symbol = this.formatSymbol(orderData.symbol);
    
    return {
      symbol: symbol,
      qty: parseInt(orderData.qty),
      type: orderData.type, // 1=Market, 2=Limit, 3=Stop Loss
      side: orderData.side === 'BUY' ? 1 : -1,
      productType: orderData.productType || 'INTRADAY',
      limitPrice: orderData.limitPrice || 0,
      stopPrice: orderData.stopPrice || 0,
      validity: orderData.validity || 'DAY',
      disclosedQty: orderData.disclosedQty || 0,
      offlineOrder: orderData.offlineOrder || 'False'
    };
  }

  // Format symbol for Fyers API
  formatSymbol(symbol) {
    // Convert symbol format if needed
    // Example: RELIANCE -> NSE:RELIANCE-EQ
    if (!symbol.includes(':')) {
      return `NSE:${symbol}-EQ`;
    }
    return symbol;
  }

  // Refresh access token
  async refreshAccessToken(refreshToken) {
    try {
      const data = {
        grant_type: 'refresh_token',
        appIdHash: this.generateAppIdHash(),
        refresh_token: refreshToken
      };

      const response = await axios.post(`${this.baseURL}/api/v2/token`, data, {
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (response.data.s === 'ok') {
        return {
          accessToken: response.data.access_token,
          refreshToken: response.data.refresh_token,
          expiresIn: response.data.expires_in
        };
      } else {
        throw new Error(response.data.message || 'Failed to refresh token');
      }
    } catch (error) {
      logger.error('Fyers token refresh error', { error: error.message });
      throw error;
    }
  }
}

module.exports = new FyersAPI();
