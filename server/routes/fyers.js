// Fixed Fyers Connection Handler
// Replace your server/routes/fyers.js with this improved version

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const axios = require('axios');

// Fyers API Configuration
const FYERS_AUTH_URL = 'https://api-t1.fyers.in'; // For auth endpoints
const FYERS_API_URL = 'https://api.fyers.in';     // For trading endpoints
const FYERS_APP_ID = process.env.FYERS_APP_ID;
const FYERS_SECRET_KEY = process.env.FYERS_SECRET_KEY;
const FYERS_REDIRECT_URI = process.env.FYERS_REDIRECT_URI;

// Generate App ID Hash
function generateAppIdHash() {
  if (!FYERS_APP_ID || !FYERS_SECRET_KEY) {
    throw new Error('Missing FYERS_APP_ID or FYERS_SECRET_KEY');
  }
  
  return crypto
    .createHash('sha256')
    .update(`${FYERS_APP_ID}:${FYERS_SECRET_KEY}`)
    .digest('hex');
}

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
    // DEBUG: Log environment variables
    console.log('🔍 Environment check:', {
      hasAppId: !!FYERS_APP_ID,
      hasSecretKey: !!FYERS_SECRET_KEY,
      hasRedirectURI: !!FYERS_REDIRECT_URI,
      appId: FYERS_APP_ID,
      redirectURI: FYERS_REDIRECT_URI
    });

    // Validate configuration
    if (!FYERS_APP_ID || !FYERS_SECRET_KEY || !FYERS_REDIRECT_URI) {
      return res.status(500).json({
        error: 'Configuration Error',
        message: 'Fyers credentials not configured. Please check server environment variables.',
        details: {
          hasAppId: !!FYERS_APP_ID,
          hasSecretKey: !!FYERS_SECRET_KEY,
          hasRedirectURI: !!FYERS_REDIRECT_URI
        }
      });
    }

    // Generate state for CSRF protection
    const state = crypto.randomBytes(16).toString('hex');
    
    // Store state in session or database for validation
    req.session = req.session || {};
    req.session.fyersState = state;

    // Build authorization URL
    const authUrl = new URL(`${FYERS_AUTH_URL}/api/v3/generate-authcode`);
    authUrl.searchParams.append('client_id', FYERS_APP_ID);
    authUrl.searchParams.append('redirect_uri', FYERS_REDIRECT_URI);
    authUrl.searchParams.append('response_type', 'code');
    authUrl.searchParams.append('state', state);

    console.log('🔐 Initiating Fyers OAuth flow');
    console.log('Auth URL:', authUrl.toString());

    // Return JSON response for frontend to handle
    res.json({
      success: true,
      url: authUrl.toString(),
      state: state
    });
  } catch (error) {
    console.error('Error generating auth URL:', error);
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
    const { code, state } = req.query;

    // Validate required parameters
    if (!code) {
      return res.status(400).json({
        error: 'Missing Parameter',
        message: 'Authorization code not received from Fyers'
      });
    }

    // Check if code is an error code (like 200, 400, etc.)
    if (code === '200' || code === '400' || code === '401' || code === '403' || code === '404' || code === '500') {
      console.log('❌ Fyers returned error code:', code);
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      const errorMessage = encodeURIComponent(`Fyers login failed with error code: ${code}`);
      return res.redirect(`${frontendUrl}/dashboard/settings?fyers_error=${errorMessage}`);
    }

    // Validate state (CSRF protection)
    if (req.session?.fyersState && state !== req.session.fyersState) {
      return res.status(400).json({
        error: 'Invalid State',
        message: 'State parameter mismatch. Possible CSRF attack.'
      });
    }

    console.log('📨 Received auth code from Fyers');
    console.log('Code:', code.substring(0, 20) + '...');

    // Exchange auth code for access token
    const appIdHash = generateAppIdHash();
    
    console.log('🔄 Exchanging auth code for access token...');
    
    const tokenResponse = await axios.post(
      `${FYERS_AUTH_URL}/api/v3/validate-authcode`,
      {
        grant_type: 'authorization_code',
        appIdHash: appIdHash,
        code: code
      },
      {
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('✅ Token exchange successful');
    console.log('Response:', JSON.stringify(tokenResponse.data, null, 2));

    // Extract tokens
    const { access_token, refresh_token } = tokenResponse.data;

    if (!access_token) {
      throw new Error('No access token in response');
    }

    // Store tokens securely in database
    // TODO: Implement token storage in your database
    // await storeTokens(req.user.id, access_token, refresh_token);

    // For now, store in session (NOT recommended for production)
    req.session.fyersAccessToken = access_token;
    req.session.fyersRefreshToken = refresh_token;

    console.log('💾 Tokens stored successfully');

    // Redirect to frontend success page
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    res.redirect(`${frontendUrl}/dashboard/settings?fyers_connected=true`);

  } catch (error) {
    console.error('❌ Callback error:', error.response?.data || error.message);
    
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
    const accessToken = req.session?.fyersAccessToken;

    if (!accessToken) {
      return res.json({
        connected: false,
        message: 'Not connected to Fyers'
      });
    }

    // Verify token by fetching profile
    const profileResponse = await axios.get(
      `${FYERS_API_URL}/api/v3/profile`,
      {
        headers: {
          Authorization: `${FYERS_APP_ID}:${accessToken}`
        }
      }
    );

    res.json({
      connected: true,
      profile: profileResponse.data
    });

  } catch (error) {
    // Token might be expired
    res.json({
      connected: false,
      message: 'Token expired or invalid'
    });
  }
});

// 4. POST /api/fyers/disconnect - Disconnect Fyers account
router.post('/disconnect', async (req, res) => {
  try {
    const accessToken = req.session?.fyersAccessToken;

    if (accessToken) {
      // Call Fyers logout endpoint
      await axios.delete(
        `${FYERS_API_URL}/api/v3/logout`,
        {
          headers: {
            Authorization: `${FYERS_APP_ID}:${accessToken}`
          }
        }
      ).catch(() => {
        // Ignore errors, we're disconnecting anyway
      });
    }

    // Clear session
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
    const accessToken = req.session?.fyersAccessToken;

    if (!accessToken) {
      return res.status(401).json({
        error: 'Not Authenticated',
        message: 'Please connect your Fyers account first'
      });
    }

    const response = await axios.get(
      `${FYERS_API_URL}/api/v3/profile`,
      {
        headers: {
          Authorization: `${FYERS_APP_ID}:${accessToken}`
        }
      }
    );

    res.json(response.data);

  } catch (error) {
    handleFyersError(error, res);
  }
});

// 6. GET /api/fyers/funds - Get account funds
router.get('/funds', async (req, res) => {
  try {
    const accessToken = req.session?.fyersAccessToken;

    if (!accessToken) {
      return res.status(401).json({
        error: 'Not Authenticated',
        message: 'Please connect your Fyers account first'
      });
    }

    const response = await axios.get(
      `${FYERS_API_URL}/api/v3/funds`,
      {
        headers: {
          Authorization: `${FYERS_APP_ID}:${accessToken}`
        }
      }
    );

    res.json(response.data);

  } catch (error) {
    handleFyersError(error, res);
  }
});

module.exports = router;