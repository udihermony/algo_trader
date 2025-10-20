// Fyers API Routes using official fyers-api-v3 SDK
const express = require('express');
const router = express.Router();
const FyersAPI = require('../services/fyersAPI');
const logger = require('../utils/logger');
const { 
  getFyersCredentials, 
  saveFyersCredentials, 
  clearFyersCredentials 
} = require('../utils/fyersTokens');

// Initialize Fyers API service
let fyersAPI;
try {
  fyersAPI = new FyersAPI();
} catch (error) {
  logger.error('Failed to initialize FyersAPI service', { error: error.message });
}

// Helper to get user ID from request
const getUserId = (req) => {
  // If using JWT auth middleware, userId should be in req.user
  return req.user?.id || 1; // Fallback to user 1 for now
};

// Error handler middleware
const handleFyersError = (error, res) => {
  console.error('Fyers API Error:', error.response?.data || error.message);
  
  const statusCode = error.response?.status || 500;
  const errorMessage = error.response?.data?.message || error.message;
  
  return res.status(statusCode).json({
    error: 'Fyers API Error',
    message: errorMessage,
    details: error.response?.data || null
  });
};

// 1. GET /api/fyers/login - Initiate OAuth flow
router.get('/login', (req, res) => {
  try {
    if (!fyersAPI) {
      return res.status(500).json({
        error: 'Service Error',
        message: 'Fyers API service not initialized'
      });
    }

    logger.info('Initiating Fyers OAuth flow');

    // Generate authorization URL using SDK
    const authData = fyersAPI.generateAuthURL();
    
    // Store state in session for CSRF protection
    req.session = req.session || {};
    req.session.fyersState = authData.state;
    req.session.userId = getUserId(req); // Store user ID for callback

    logger.info('Generated auth URL', { 
      url: authData.url,
      hasState: !!authData.state,
      userId: req.session.userId
    });

    // Return JSON response for frontend to handle
    res.json({
      success: true,
      url: authData.url,
      state: authData.state
    });
  } catch (error) {
    logger.error('Error generating auth URL', { error: error.message });
    res.status(500).json({
      error: 'Server Error',
      message: 'Failed to initiate Fyers login',
      details: error.message
    });
  }
});

// 2. GET /api/fyers/callback - Handle OAuth callback
router.get('/callback', async (req, res) => {
  try {
    if (!fyersAPI) {
      throw new Error('Fyers API service not initialized');
    }

    const { auth_code, code, state, s, message } = req.query;

    logger.info('Fyers callback received', { 
      hasAuthCode: !!auth_code,
      hasCode: !!code,
      hasState: !!state,
      s: s,
      message: message,
      authCodeType: auth_code ? 'JWT' : 'simple',
      codeValue: code
    });

    // Check if Fyers returned an error
    if (s === 'error') {
      logger.error('Fyers returned error', { code, message });
      const frontendUrl = process.env.FRONTEND_URL || 'https://algo-trader-chi.vercel.app';
      return res.redirect(`${frontendUrl}/dashboard/settings?fyers_error=${encodeURIComponent(message || 'Authentication failed')}`);
    }

    // Get auth code (Fyers sends it as 'auth_code' or 'code')
    // Priority: auth_code (JWT token) > code (simple code)
    const authCode = auth_code || code;
    
    if (!authCode) {
      logger.error('No auth code received', { query: req.query });
      const frontendUrl = process.env.FRONTEND_URL || 'https://algo-trader-chi.vercel.app';
      return res.redirect(`${frontendUrl}/dashboard/settings?fyers_error=${encodeURIComponent('No authorization code received')}`);
    }

    // Check if code is an error code (but not 200, which is success)
    if (authCode === '400' || authCode === '401' || authCode === '403' || authCode === '404' || authCode === '500') {
      logger.error('Fyers returned error code', { authCode });
      const frontendUrl = process.env.FRONTEND_URL || 'https://algo-trader-chi.vercel.app';
      const errorMessage = encodeURIComponent(`Fyers login failed with error code: ${authCode}`);
      return res.redirect(`${frontendUrl}/dashboard/settings?fyers_error=${errorMessage}`);
    }

    // Validate state (CSRF protection)
    if (req.session?.fyersState && state !== req.session.fyersState) {
      return res.status(400).json({
        error: 'Invalid State',
        message: 'State parameter mismatch. Possible CSRF attack.'
      });
    }

    logger.info('Exchanging auth code for access token', { 
      authCodeLength: authCode.length 
    });

    // Exchange auth code for access token using SDK
    const tokenData = await fyersAPI.getAccessToken(authCode);

    if (!tokenData.accessToken) {
      throw new Error('No access token in response');
    }

    // Store tokens securely in session (TODO: implement database storage)
    req.session.fyersAccessToken = tokenData.accessToken;
    req.session.fyersRefreshToken = tokenData.refreshToken;

    logger.info('Tokens stored successfully', {
      hasAccessToken: !!tokenData.accessToken,
      hasRefreshToken: !!tokenData.refreshToken
    });

    // Redirect to frontend dashboard with success
    const frontendUrl = process.env.FRONTEND_URL || 'https://algo-trader-chi.vercel.app';
    res.redirect(`${frontendUrl}/dashboard?login=success`);

  } catch (error) {
    logger.error('Callback error', { 
      error: error.message,
      status: error.response?.status,
      errorData: error.response?.data
    });
    
    // Redirect to frontend with error
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const errorMessage = encodeURIComponent(
      error.response?.data?.message || 'Failed to connect Fyers account'
    );
    res.redirect(`${frontendUrl}/dashboard/settings?fyers_error=${errorMessage}`);
  }
});

// 3. GET /api/fyers/status - Check connection status
router.get('/status', async (req, res) => {
  try {
    const userId = getUserId(req);
    const credentials = await getFyersCredentials(userId);

    if (!credentials || !credentials.accessToken) {
      return res.json({
        success: true,
        isLoggedIn: false,
        hasAccessToken: false,
        hasRefreshToken: false,
        message: 'Not connected to Fyers'
      });
    }

    if (!fyersAPI) {
      return res.status(500).json({
        error: 'Service Error',
        message: 'Fyers API service not initialized'
      });
    }

    try {
      // Verify token by fetching profile
      const profile = await fyersAPI.getProfile(credentials.accessToken);

      res.json({
        success: true,
        isLoggedIn: true,
        hasAccessToken: true,
        hasRefreshToken: !!credentials.refreshToken,
        profile: profile
      });
    } catch (error) {
      // Token might be expired
      logger.warn('Token verification failed', { error: error.message, userId });
      res.json({
        success: true,
        isLoggedIn: false,
        hasAccessToken: false,
        hasRefreshToken: false,
        message: 'Token expired or invalid',
        needsReauth: true
      });
    }

  } catch (error) {
    logger.error('Status check error', { error: error.message });
    res.status(500).json({
      error: 'Server Error',
      message: 'Failed to check Fyers status'
    });
  }
});

// 4. POST /api/fyers/disconnect - Disconnect Fyers account
router.post('/disconnect', async (req, res) => {
  try {
    const userId = getUserId(req);
    const credentials = await getFyersCredentials(userId);

    if (credentials?.accessToken && fyersAPI) {
      try {
        await fyersAPI.logout(credentials.accessToken);
      } catch (error) {
        logger.warn('Logout API call failed, continuing with disconnect', { 
          error: error.message,
          userId 
        });
      }
    }

    // Clear credentials from database
    await clearFyersCredentials(userId);

    // Also clear session if exists
    if (req.session) {
      delete req.session.fyersAccessToken;
      delete req.session.fyersRefreshToken;
      delete req.session.fyersState;
    }

    res.json({
      success: true,
      message: 'Disconnected from Fyers successfully'
    });

  } catch (error) {
    handleFyersError(error, res);
  }
});

// 5. GET /api/fyers/profile - Get user profile
router.get('/profile', async (req, res) => {
  try {
    const userId = getUserId(req);
    const credentials = await getFyersCredentials(userId);

    if (!credentials || !credentials.accessToken) {
      return res.status(401).json({
        error: 'Not Authenticated',
        message: 'Please connect your Fyers account first'
      });
    }

    if (!fyersAPI) {
      return res.status(500).json({
        error: 'Service Error',
        message: 'Fyers API service not initialized'
      });
    }

    const profile = await fyersAPI.getProfile(credentials.accessToken);
    res.json(profile);

  } catch (error) {
    handleFyersError(error, res);
  }
});

// 6. GET /api/fyers/funds - Get account funds
router.get('/funds', async (req, res) => {
  try {
    const userId = getUserId(req);
    const credentials = await getFyersCredentials(userId);

    if (!credentials || !credentials.accessToken) {
      return res.status(401).json({
        error: 'Not Authenticated',
        message: 'Please connect your Fyers account first'
      });
    }

    if (!fyersAPI) {
      return res.status(500).json({
        error: 'Service Error',
        message: 'Fyers API service not initialized'
      });
    }

    const funds = await fyersAPI.getBalance(credentials.accessToken);
    res.json(funds);

  } catch (error) {
    handleFyersError(error, res);
  }
});

// 7. GET /api/fyers/positions - Get positions
router.get('/positions', async (req, res) => {
  try {
    const userId = getUserId(req);
    const credentials = await getFyersCredentials(userId);

    if (!credentials || !credentials.accessToken) {
      return res.status(401).json({
        error: 'Not Authenticated',
        message: 'Please connect your Fyers account first'
      });
    }

    if (!fyersAPI) {
      return res.status(500).json({
        error: 'Service Error',
        message: 'Fyers API service not initialized'
      });
    }

    const positions = await fyersAPI.getPositions(credentials.accessToken);
    res.json(positions);

  } catch (error) {
    handleFyersError(error, res);
  }
});

module.exports = router;