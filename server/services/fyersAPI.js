const axios = require('axios');
const crypto = require('crypto');
const logger = require('../utils/logger');

class FyersAPI {
  constructor() {
    this.baseURL = process.env.FYERS_BASE_URL || 'https://api.fyers.in';
    this.appId = process.env.FYERS_APP_ID;
    this.secretKey = process.env.FYERS_SECRET_KEY;
    this.redirectURI = process.env.FYERS_REDIRECT_URI;
    
    // Extract base app ID without suffix for hashing
    this.baseAppId = this.appId ? this.appId.replace(/-100$/, '') : null;
  }

  // Generate authorization URL for OAuth flow
  generateAuthURL() {
    const state = crypto.randomBytes(16).toString('hex');
    const params = new URLSearchParams({
      client_id: this.appId,
      redirect_uri: this.redirectURI,
      response_type: 'code',
      state: state
    });

    return {
      url: `https://api-t1.fyers.in/api/v3/generate-authcode?${params.toString()}`,
      state: state
    };
  }

  // Exchange authorization code for access token
  async getAccessToken(authCode) {
    let data; // Declare data outside try block for error logging
    
    try {
      logger.info('Starting token exchange', { 
        hasAuthCode: !!authCode,
        hasAppId: !!this.appId,
        hasBaseAppId: !!this.baseAppId,
        hasSecretKey: !!this.secretKey,
        redirectURI: this.redirectURI,
        appId: this.appId,
        baseAppId: this.baseAppId
      });

      if (!this.appId || !this.secretKey) {
        throw new Error('Fyers app credentials not configured');
      }

      data = {
        grant_type: 'authorization_code',
        appIdHash: this.generateAppIdHash(),
        code: authCode
      };

      logger.info('Making token exchange request', { 
        url: 'https://api-t1.fyers.in/api/v3/validate-authcode',
        requestData: {
          grant_type: data.grant_type,
          appIdHash: data.appIdHash ? `${data.appIdHash.substring(0, 8)}...` : 'missing',
          code: data.code ? `${data.code.substring(0, 20)}...` : 'missing'
        }
      });

      const response = await axios.post('https://api-t1.fyers.in/api/v3/validate-authcode', data, {
        headers: {
          'Content-Type': 'application/json'
        }
      });

      logger.info('Token exchange response', { 
        status: response.status,
        responseData: response.data
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
      logger.error('Fyers token exchange error', { 
        error: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText,
        responseData: error.response?.data,
        responseHeaders: error.response?.headers,
        requestData: data ? {
          grant_type: data.grant_type,
          appIdHash: data.appIdHash ? `${data.appIdHash.substring(0, 8)}...` : 'missing',
          code: data.code ? `${data.code.substring(0, 20)}...` : 'missing'
        } : 'data not available'
      });
      throw error;
    }
  }

  // Generate app ID hash for authentication
  generateAppIdHash() {
    const hash = crypto.createHash('sha256');
    hash.update(`${this.baseAppId}:${this.secretKey}`);
    return hash.digest('hex');
  }

  // Create authenticated API client
  createClient(accessToken) {
    return axios.create({
      baseURL: 'https://api-t1.fyers.in',
      headers: {
        'Authorization': `${this.appId}:${accessToken}`,
        'Content-Type': 'application/json'
      }
    });
  }

  // Get user profile
  async getProfile(accessToken) {
    try {
      const client = this.createClient(accessToken);
      const response = await client.get('/api/v3/profile');
      
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
      const response = await client.get('/api/v3/funds');
      
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
      const response = await client.get('/api/v3/positions');
      
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
      
      const response = await client.post('/api/v3/orders', validatedOrder);
      
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
      
      const response = await client.put(`/api/v3/orders/${orderId}`, modifyData);
      
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
      
      const response = await client.delete(`/api/v3/orders/${orderId}`);
      
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
      const response = await client.get('/api/v3/orders');
      
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
      
      const response = await client.get(`/api/v3/market-data?symbols=${symbolsParam}`);
      
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
      type: orderData.type, // 1=Limit, 2=Market, 3=Stop Order (SL-M), 4=Stoplimit Order (SL-L)
      side: orderData.side === 'BUY' ? 1 : -1,
      productType: orderData.productType || 'INTRADAY', // CNC, INTRADAY, MARGIN, CO, BO, MTF
      limitPrice: orderData.limitPrice || 0,
      stopPrice: orderData.stopPrice || 0,
      validity: orderData.validity || 'DAY', // DAY, IOC
      disclosedQty: orderData.disclosedQty || 0,
      offlineOrder: orderData.offlineOrder || false,
      stopLoss: orderData.stopLoss || 0,
      takeProfit: orderData.takeProfit || 0,
      orderTag: orderData.orderTag || ''
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

  // Get holdings
  async getHoldings(accessToken) {
    try {
      const client = this.createClient(accessToken);
      const response = await client.get('/api/v3/holdings');
      
      if (response.data.s === 'ok') {
        return response.data;
      } else {
        throw new Error(response.data.message || 'Failed to get holdings');
      }
    } catch (error) {
      logger.error('Fyers holdings fetch error', { error: error.message });
      throw error;
    }
  }

  // Get tradebook
  async getTradeBook(accessToken, orderTag = null) {
    try {
      const client = this.createClient(accessToken);
      let url = '/api/v3/tradebook';
      
      if (orderTag) {
        url += `?order_tag=${encodeURIComponent(orderTag)}`;
      }
      
      const response = await client.get(url);
      
      if (response.data.s === 'ok') {
        return response.data;
      } else {
        throw new Error(response.data.message || 'Failed to get tradebook');
      }
    } catch (error) {
      logger.error('Fyers tradebook fetch error', { error: error.message });
      throw error;
    }
  }

  // Logout user
  async logout(accessToken) {
    try {
      const client = this.createClient(accessToken);
      const response = await client.post('/api/v3/logout');
      
      if (response.data.s === 'ok') {
        return response.data;
      } else {
        throw new Error(response.data.message || 'Failed to logout');
      }
    } catch (error) {
      logger.error('Fyers logout error', { error: error.message });
      throw error;
    }
  }

  // Get market status
  async getMarketStatus(accessToken) {
    try {
      const client = this.createClient(accessToken);
      const response = await client.get('/api/v3/market-status');
      
      if (response.data.s === 'ok') {
        return response.data;
      } else {
        throw new Error(response.data.message || 'Failed to get market status');
      }
    } catch (error) {
      logger.error('Fyers market status fetch error', { error: error.message });
      throw error;
    }
  }

  // Get historical data
  async getHistoricalData(accessToken, symbol, resolution, dateFormat, rangeFrom, rangeTo, contFlag) {
    try {
      const client = this.createClient(accessToken);
      const params = new URLSearchParams({
        symbol: symbol,
        resolution: resolution,
        date_format: dateFormat,
        range_from: rangeFrom,
        range_to: rangeTo,
        cont_flag: contFlag
      });
      
      const response = await client.get(`/api/v3/history?${params.toString()}`);
      
      if (response.data.s === 'ok') {
        return response.data;
      } else {
        throw new Error(response.data.message || 'Failed to get historical data');
      }
    } catch (error) {
      logger.error('Fyers historical data fetch error', { error: error.message });
      throw error;
    }
  }

  // Get market depth
  async getMarketDepth(accessToken, symbol) {
    try {
      const client = this.createClient(accessToken);
      const response = await client.get(`/api/v3/market-depth?symbol=${encodeURIComponent(symbol)}`);
      
      if (response.data.s === 'ok') {
        return response.data;
      } else {
        throw new Error(response.data.message || 'Failed to get market depth');
      }
    } catch (error) {
      logger.error('Fyers market depth fetch error', { error: error.message });
      throw error;
    }
  }

  // Get quotes
  async getQuotes(accessToken, symbols) {
    try {
      const client = this.createClient(accessToken);
      const symbolsParam = Array.isArray(symbols) ? symbols.join(',') : symbols;
      
      const response = await client.get(`/api/v3/quotes?symbols=${encodeURIComponent(symbolsParam)}`);
      
      if (response.data.s === 'ok') {
        return response.data;
      } else {
        throw new Error(response.data.message || 'Failed to get quotes');
      }
    } catch (error) {
      logger.error('Fyers quotes fetch error', { error: error.message });
      throw error;
    }
  }

  // Refresh access token
  async refreshAccessToken(refreshToken, pin) {
    try {
      const data = {
        grant_type: 'refresh_token',
        appIdHash: this.generateAppIdHash(),
        refresh_token: refreshToken,
        pin: pin
      };

      const response = await axios.post('https://api-t1.fyers.in/api/v3/validate-refresh-token', data, {
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
