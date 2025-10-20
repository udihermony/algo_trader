//server/services/fyersAPI.js

const axios = require('axios');
const crypto = require('crypto');
const logger = require('../utils/logger');

// Import official Fyers SDK
let FyersModel;
try {
  FyersModel = require('fyers-api-v3').fyersModel;
} catch (e) {
  logger.warn('fyers-api-v3 SDK not found, falling back to axios-only integration');
}

class FyersAPI {
  constructor() {
    this.baseURL = process.env.FYERS_BASE_URL || 'https://api.fyers.in';
    this.appId = process.env.FYERS_APP_ID;
    this.secretKey = process.env.FYERS_SECRET_KEY;
    this.redirectURI = process.env.FYERS_REDIRECT_URI;
    this.sdk = null;
    
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

    // Initialize SDK if available
    if (FyersModel) {
      try {
        this.sdk = new FyersModel({
          path: process.env.FYERS_LOG_PATH || 'logs',
          enableLogging: process.env.FYERS_ENABLE_LOGGING === 'true'
        });
        this.sdk.setAppId(this.appId);
        this.sdk.setRedirectUrl(this.redirectURI);
        logger.info('Fyers SDK initialized successfully');
      } catch (e) {
        logger.warn('Failed to initialize fyers-api-v3 SDK, using axios fallback', { error: e.message });
        this.sdk = null;
      }
    }
  }

  // Generate authorization URL for OAuth flow
  generateAuthURL() {
    // Use SDK if available, otherwise fall back to manual URL generation
    if (this.sdk && typeof this.sdk.generateAuthCode === 'function') {
      try {
        const url = this.sdk.generateAuthCode();
        logger.info('Generated auth URL using SDK', { url });
        return { url };
      } catch (e) {
        logger.warn('SDK generateAuthCode failed, using fallback', { error: e.message });
      }
    }

    // Fallback: manual URL generation
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
    try {
      logger.info('Starting token exchange', { 
        hasAuthCode: !!authCode,
        hasAppId: !!this.appId,
        hasSecretKey: !!this.secretKey,
        redirectURI: this.redirectURI,
        appId: this.appId,
        usingSDK: !!this.sdk
      });

      // Use SDK if available
      if (this.sdk && typeof this.sdk.generate_access_token === 'function') {
        try {
          const response = await this.sdk.generate_access_token({
            client_id: this.appId,
            secret_key: this.secretKey,
            auth_code: authCode
          });

          logger.info('SDK token exchange response', {
            success: response?.s === 'ok',
            hasAccessToken: !!response?.access_token,
            hasRefreshToken: !!response?.refresh_token
          });

          if (response?.s === 'ok') {
            // Set access token in SDK for future calls
            try {
              this.sdk.setAccessToken(response.access_token);
            } catch (e) {
              logger.warn('Failed to set access token in SDK', { error: e.message });
            }

            return {
              accessToken: response.access_token,
              refreshToken: response.refresh_token,
              expiresIn: response.expires_in
            };
          } else {
            throw new Error(response?.message || 'Failed to get access token');
          }
        } catch (e) {
          logger.warn('SDK token exchange failed, using fallback', { error: e.message });
        }
      }

      // Fallback: manual axios call
      const appIdHash = this.generateAppIdHash();
      const data = {
        grant_type: 'authorization_code',
        appIdHash: appIdHash,
        code: authCode
      };

      logger.info('Making fallback token exchange request', { 
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

      logger.info('Fallback token exchange response', { 
        status: response.status,
        success: response.data.s === 'ok',
        hasAccessToken: !!response.data.access_token,
        hasRefreshToken: !!response.data.refresh_token
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
        errorCode: error.response?.data?.code,
        errorMessage: error.response?.data?.message
      });
      throw error;
    }
  }

  // Generate app ID hash for authentication (fallback method)
  generateAppIdHash() {
    const hash = crypto.createHash('sha256');
    hash.update(`${this.appId}:${this.secretKey}`);
    return hash.digest('hex');
  }

  // Create authenticated API client (fallback method)
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
      // Use SDK if available
      if (this.sdk && typeof this.sdk.get_profile === 'function') {
        try {
          // Set access token in SDK format
          this.sdk.setAccessToken(`${this.appId}:${accessToken}`);
          const response = await this.sdk.get_profile();
          
          if (response?.s === 'ok') {
            return response.data || response;
          } else {
            throw new Error(response?.message || 'Failed to get profile');
          }
        } catch (e) {
          logger.warn('SDK profile fetch failed, using fallback', { error: e.message });
        }
      }

      // Fallback: axios call
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
      // Use SDK if available
      if (this.sdk && typeof this.sdk.get_funds === 'function') {
        try {
          this.sdk.setAccessToken(`${this.appId}:${accessToken}`);
          const response = await this.sdk.get_funds();
          
          if (response?.s === 'ok') {
            return response.data || response;
          } else {
            throw new Error(response?.message || 'Failed to get balance');
          }
        } catch (e) {
          logger.warn('SDK balance fetch failed, using fallback', { error: e.message });
        }
      }

      // Fallback: axios call
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
      // Use SDK if available
      if (this.sdk && typeof this.sdk.get_positions === 'function') {
        try {
          this.sdk.setAccessToken(`${this.appId}:${accessToken}`);
          const response = await this.sdk.get_positions();
          
          if (response?.s === 'ok') {
            return response.data || response;
          } else {
            throw new Error(response?.message || 'Failed to get positions');
          }
        } catch (e) {
          logger.warn('SDK positions fetch failed, using fallback', { error: e.message });
        }
      }

      // Fallback: axios call
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

  // Get quotes
  async getQuotes(accessToken, symbols) {
    try {
      // Use SDK if available
      if (this.sdk && typeof this.sdk.getQuotes === 'function') {
        try {
          this.sdk.setAccessToken(`${this.appId}:${accessToken}`);
          const symbolList = Array.isArray(symbols) ? symbols : [symbols];
          const response = await this.sdk.getQuotes(symbolList);
          
          if (response?.s === 'ok') {
            return response.data || response;
          } else {
            throw new Error(response?.message || 'Failed to get quotes');
          }
        } catch (e) {
          logger.warn('SDK quotes fetch failed, using fallback', { error: e.message });
        }
      }

      // Fallback: axios call
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

  // Get market depth
  async getMarketDepth(accessToken, symbol) {
    try {
      // Use SDK if available
      if (this.sdk && typeof this.sdk.getMarketDepth === 'function') {
        try {
          this.sdk.setAccessToken(`${this.appId}:${accessToken}`);
          const response = await this.sdk.getMarketDepth({ 
            symbol: [symbol], 
            ohlcv_flag: 1 
          });
          
          if (response?.s === 'ok') {
            return response;
          } else {
            throw new Error(response?.message || 'Failed to get market depth');
          }
        } catch (e) {
          logger.warn('SDK market depth fetch failed, using fallback', { error: e.message });
        }
      }

      // Fallback: axios call
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

  // Place order
  async placeOrder(accessToken, orderData) {
    try {
      // Use SDK if available
      if (this.sdk && typeof this.sdk.place_order === 'function') {
        try {
          this.sdk.setAccessToken(`${this.appId}:${accessToken}`);
          const validatedOrder = this.validateOrderData(orderData);
          const response = await this.sdk.place_order(validatedOrder);
          
          if (response?.s === 'ok') {
            logger.info('Order placed successfully via SDK', { 
              orderId: response.data?.id,
              symbol: orderData.symbol,
              side: orderData.side,
              quantity: orderData.qty
            });
            return response.data || response;
          } else {
            throw new Error(response?.message || 'Failed to place order');
          }
        } catch (e) {
          logger.warn('SDK order placement failed, using fallback', { error: e.message });
        }
      }

      // Fallback: axios call
      const client = this.createClient(accessToken);
      const validatedOrder = this.validateOrderData(orderData);
      
      const response = await client.post('/api/v3/orders', validatedOrder);
      
      if (response.data.s === 'ok') {
        logger.info('Order placed successfully via fallback', { 
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
        symbol: orderData?.symbol,
        side: orderData?.side,
        qty: orderData?.qty
      });
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

  // Get order book
  async getOrderBook(accessToken) {
    try {
      // Use SDK if available
      if (this.sdk && typeof this.sdk.get_orders === 'function') {
        try {
          this.sdk.setAccessToken(`${this.appId}:${accessToken}`);
          const response = await this.sdk.get_orders();
          
          if (response?.s === 'ok') {
            return response.data || response;
          } else {
            throw new Error(response?.message || 'Failed to get order book');
          }
        } catch (e) {
          logger.warn('SDK order book fetch failed, using fallback', { error: e.message });
        }
      }

      // Fallback: axios call
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

  // Cancel order
  async cancelOrder(accessToken, orderId) {
    try {
      // Use SDK if available
      if (this.sdk && typeof this.sdk.cancel_order === 'function') {
        try {
          this.sdk.setAccessToken(`${this.appId}:${accessToken}`);
          const response = await this.sdk.cancel_order({ id: orderId });
          
          if (response?.s === 'ok') {
            logger.info('Order cancelled successfully via SDK', { orderId });
            return response.data || response;
          } else {
            throw new Error(response?.message || 'Failed to cancel order');
          }
        } catch (e) {
          logger.warn('SDK order cancellation failed, using fallback', { error: e.message });
        }
      }

      // Fallback: axios call
      const client = this.createClient(accessToken);
      const response = await client.delete(`/api/v3/orders/${orderId}`);
      
      if (response.data.s === 'ok') {
        logger.info('Order cancelled successfully via fallback', { orderId });
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

  // Modify order
  async modifyOrder(accessToken, orderId, modifyData) {
    try {
      // Use SDK if available
      if (this.sdk && typeof this.sdk.modify_order === 'function') {
        try {
          this.sdk.setAccessToken(`${this.appId}:${accessToken}`);
          const response = await this.sdk.modify_order({ id: orderId, ...modifyData });
          
          if (response?.s === 'ok') {
            logger.info('Order modified successfully via SDK', { orderId });
            return response.data || response;
          } else {
            throw new Error(response?.message || 'Failed to modify order');
          }
        } catch (e) {
          logger.warn('SDK order modification failed, using fallback', { error: e.message });
        }
      }

      // Fallback: axios call
      const client = this.createClient(accessToken);
      const response = await client.put(`/api/v3/orders/${orderId}`, modifyData);
      
      if (response.data.s === 'ok') {
        logger.info('Order modified successfully via fallback', { orderId });
        return response.data.data;
      } else {
        throw new Error(response.data.message || 'Failed to modify order');
      }
    } catch (error) {
      logger.error('Fyers order modification error', { 
        error: error.message,
        orderId
      });
      throw error;
    }
  }

  // Get holdings
  async getHoldings(accessToken) {
    try {
      // Use SDK if available
      if (this.sdk && typeof this.sdk.get_holdings === 'function') {
        try {
          this.sdk.setAccessToken(`${this.appId}:${accessToken}`);
          const response = await this.sdk.get_holdings();
          
          if (response?.s === 'ok') {
            return response.data || response;
          } else {
            throw new Error(response?.message || 'Failed to get holdings');
          }
        } catch (e) {
          logger.warn('SDK holdings fetch failed, using fallback', { error: e.message });
        }
      }

      // Fallback: axios call
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
      // Use SDK if available
      if (this.sdk && typeof this.sdk.get_tradebook === 'function') {
        try {
          this.sdk.setAccessToken(`${this.appId}:${accessToken}`);
          const params = orderTag ? { order_tag: orderTag } : {};
          const response = await this.sdk.get_tradebook(params);
          
          if (response?.s === 'ok') {
            return response.data || response;
          } else {
            throw new Error(response?.message || 'Failed to get tradebook');
          }
        } catch (e) {
          logger.warn('SDK tradebook fetch failed, using fallback', { error: e.message });
        }
      }

      // Fallback: axios call
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
      // Use SDK if available
      if (this.sdk && typeof this.sdk.logout === 'function') {
        try {
          this.sdk.setAccessToken(`${this.appId}:${accessToken}`);
          const response = await this.sdk.logout();
          
          if (response?.s === 'ok') {
            return response;
          } else {
            throw new Error(response?.message || 'Failed to logout');
          }
        } catch (e) {
          logger.warn('SDK logout failed, using fallback', { error: e.message });
        }
      }

      // Fallback: axios call
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
      // Use SDK if available
      if (this.sdk && typeof this.sdk.get_market_status === 'function') {
        try {
          this.sdk.setAccessToken(`${this.appId}:${accessToken}`);
          const response = await this.sdk.get_market_status();
          
          if (response?.s === 'ok') {
            return response.data || response;
          } else {
            throw new Error(response?.message || 'Failed to get market status');
          }
        } catch (e) {
          logger.warn('SDK market status fetch failed, using fallback', { error: e.message });
        }
      }

      // Fallback: axios call
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
      // Use SDK if available
      if (this.sdk && typeof this.sdk.get_history === 'function') {
        try {
          this.sdk.setAccessToken(`${this.appId}:${accessToken}`);
          const response = await this.sdk.get_history({
            symbol,
            resolution,
            date_format: dateFormat,
            range_from: rangeFrom,
            range_to: rangeTo,
            cont_flag: contFlag
          });
          
          if (response?.s === 'ok') {
            return response.data || response;
          } else {
            throw new Error(response?.message || 'Failed to get historical data');
          }
        } catch (e) {
          logger.warn('SDK historical data fetch failed, using fallback', { error: e.message });
        }
      }

      // Fallback: axios call
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

  // Refresh access token using refresh token
  async refreshAccessToken(refreshToken, pin) {
    try {
      logger.info('Refreshing access token');

      if (!this.appId || !this.secretKey || !refreshToken || !pin) {
        throw new Error('Missing required parameters for token refresh');
      }

      // Use SDK if available
      if (this.sdk && typeof this.sdk.generate_access_token === 'function') {
        try {
          const response = await this.sdk.generate_access_token({
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
            pin: pin
          });

          if (response?.s === 'ok') {
            logger.info('Token refreshed successfully via SDK');
            return {
              accessToken: response.access_token
            };
          } else {
            throw new Error(response?.message || 'Failed to refresh token');
          }
        } catch (e) {
          logger.warn('SDK token refresh failed, using fallback', { error: e.message });
        }
      }

      // Fallback: manual axios call
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

      logger.info('Token refresh response', { 
        status: response.status,
        success: response.data.s === 'ok',
        hasAccessToken: !!response.data.access_token
      });

      if (response.data.s === 'ok') {
        return {
          accessToken: response.data.access_token
        };
      } else {
        throw new Error(response.data.message || 'Failed to refresh token');
      }
    } catch (error) {
      logger.error('Fyers token refresh error', { 
        error: error.message,
        status: error.response?.status,
        errorCode: error.response?.data?.code,
        errorMessage: error.response?.data?.message
      });
      throw error;
    }
  }
}

// Export the class, not an instance
module.exports = FyersAPI;