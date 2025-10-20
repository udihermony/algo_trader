//server/index.js
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const session = require('express-session');
const { createServer } = require('http');
const { Server } = require('socket.io');
require('dotenv').config();

const logger = require('./utils/logger');
const db = require('./config/database');
const cronJobs = require('./services/cronJobs');
const authRoutes = require('./routes/auth');
const webhookRoutes = require('./routes/webhook');
const fyersRoutes = require('./routes/fyers');
const alertsRoutes = require('./routes/alerts');
const ordersRoutes = require('./routes/orders');
const positionsRoutes = require('./routes/positions');
const strategiesRoutes = require('./routes/strategies');
const settingsRoutes = require('./routes/settings');
const { authenticateToken } = require('./middleware/auth');

const app = express();
const server = createServer(app);

// Trust proxy for Railway deployment
app.set('trust proxy', 1);
const io = new Server(server, {
  cors: {
    origin: process.env.CORS_ORIGIN || "http://localhost:3000",
    methods: ["GET", "POST"]
  }
});

// Security middleware
app.use(helmet());
app.use(cors({
  origin: [
    process.env.CORS_ORIGIN || "http://localhost:3000",
    /^https:\/\/algo-trader-.*\.vercel\.app$/
  ],
  credentials: true
}));

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET || 'your-secret-key-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production', // HTTPS only in production
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax', // Required for cross-origin
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  message: 'Too many requests from this IP, please try again later.'
});
app.use('/api/', limiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`, {
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });
  next();
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/webhook', webhookRoutes);

// Public FYERS routes (no auth required)
app.get('/api/fyers/login', (req, res) => {
  const FyersAPI = require('./services/fyersAPI');
  const fyersAPI = new FyersAPI();
  try {
    const { url } = fyersAPI.generateAuthURL();
    return res.redirect(url);
  } catch (error) {
    logger.error('FYERS login redirect error', { error: error.message });
    return res.status(500).json({ error: 'Failed to initiate FYERS login' });
  }
});

app.get('/api/fyers/callback', async (req, res) => {
  const FyersAPI = require('./services/fyersAPI');
  const fyersAPI = new FyersAPI();
  const { saveFyersCredentials } = require('./utils/fyersTokens');
  
  try {
    const { code, state, auth_code, s, message } = req.query;
    
    logger.info('FYERS callback received', { 
      code: code ? 'present' : 'missing',
      auth_code: auth_code ? 'present' : 'missing',
      state: state || 'missing',
      s: s,
      message: message
    });

    // Check for error response
    if (s === 'error' || (!code && !auth_code)) {
      const errorMsg = message || 'No authorization code received';
      logger.error('FYERS callback error', { error: errorMsg });
      return res.redirect(`https://algo-trader-chi.vercel.app/dashboard/settings?fyers_error=${encodeURIComponent(errorMsg)}`);
    }

    // Get auth code (priority: auth_code > code)
    const authCode = auth_code || code;

    // Validate state if stored in session
    if (req.session?.fyersState && state && state !== req.session.fyersState) {
      logger.error('State mismatch - possible CSRF', { 
        expected: req.session.fyersState,
        received: state 
      });
      return res.redirect('https://algo-trader-chi.vercel.app/dashboard/settings?fyers_error=Invalid+state');
    }

    // Get user ID from session or default to 1
    const userId = req.session?.userId || 1;

    // Exchange auth code for tokens
    logger.info('Exchanging auth code for tokens...', { userId });
    const tokens = await fyersAPI.getAccessToken(authCode);
    
    if (!tokens.accessToken) {
      throw new Error('No access token received');
    }

    logger.info('Token exchange successful', { 
      hasAccessToken: !!tokens.accessToken,
      hasRefreshToken: !!tokens.refreshToken,
      userId
    });

    // Save tokens to database using helper
    await saveFyersCredentials(userId, tokens);

    // Clear session state
    if (req.session) {
      delete req.session.fyersState;
    }

    logger.info('FYERS credentials stored successfully', { userId });
    return res.redirect('https://algo-trader-chi.vercel.app/dashboard/settings?fyers_success=true');
    
  } catch (error) {
    logger.error('FYERS callback error', { 
      error: error.message,
      stack: error.stack
    });
    return res.redirect(`https://algo-trader-chi.vercel.app/dashboard/settings?fyers_error=${encodeURIComponent(error.message)}`);
  }
});

// Authenticated routes
app.use('/api/fyers', authenticateToken, fyersRoutes);
app.use('/api/alerts', authenticateToken, alertsRoutes);
app.use('/api/orders', authenticateToken, ordersRoutes);
app.use('/api/positions', authenticateToken, positionsRoutes);
app.use('/api/strategies', authenticateToken, strategiesRoutes);
app.use('/api/settings', authenticateToken, settingsRoutes);

// Socket.io connection handling
io.on('connection', (socket) => {
  logger.info('Client connected', { socketId: socket.id });
  
  socket.on('join_user', (userId) => {
    socket.join(`user_${userId}`);
    logger.info('User joined room', { userId, socketId: socket.id });
  });
  
  socket.on('disconnect', () => {
    logger.info('Client disconnected', { socketId: socket.id });
  });
});

// Make io available to other modules
app.set('io', io);

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error('Unhandled error', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method
  });
  
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production' 
      ? 'Internal server error' 
      : err.message
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Database connection and server startup
const PORT = process.env.PORT || 3001;

async function startServer() {
  try {
    // Test database connection
    await db.query('SELECT NOW()');
    logger.info('Database connected successfully');
    
    // Start cron jobs
    cronJobs.start();
    
    // Start server
    server.listen(PORT, '0.0.0.0', () => {
      logger.info(`Server running on port ${PORT}`);
      logger.info(`Environment: ${process.env.NODE_ENV}`);
    });
  } catch (error) {
    logger.error('Failed to start server', { error: error.message });
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  cronJobs.stop();
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  cronJobs.stop();
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

startServer();
