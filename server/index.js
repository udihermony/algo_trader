const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
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
  const db = require('./config/database');
  
  try {
    const { code, state } = req.query;
    
    logger.info('FYERS callback received', { 
      code: code ? 'present' : 'missing', 
      state: state || 'missing',
      query: req.query 
    });
    
    if (!code) {
      logger.error('FYERS callback missing auth code', { query: req.query });
      return res.status(400).json({ error: 'Missing auth code' });
    }

    // Exchange auth code for tokens
    logger.info('Exchanging auth code for tokens...');
    const tokens = await fyersAPI.getAccessToken(code);
    logger.info('Token exchange successful', { 
      hasAccessToken: !!tokens.accessToken,
      hasRefreshToken: !!tokens.refreshToken 
    });

    // Check if user 1 exists, if not create it
    const userCheck = await db.query('SELECT id FROM users WHERE id = 1');
    if (userCheck.rows.length === 0) {
      logger.info('Creating admin user (id=1)...');
      await db.query(
        `INSERT INTO users (id, email, password_hash, first_name, last_name, is_active, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)`,
        [1, 'admin@example.com', 'dummy_hash', 'Admin', 'User', true]
      );
    }

    // Store tokens for user 1
    logger.info('Storing FYERS tokens for user 1...');
    await db.query(
      `INSERT INTO settings (user_id, fyers_credentials)
       VALUES ($1, $2)
       ON CONFLICT (user_id)
       DO UPDATE SET fyers_credentials = $2, updated_at = CURRENT_TIMESTAMP`,
      [1, JSON.stringify(tokens)]
    );

    logger.info('FYERS token stored successfully', { userId: 1 });
    return res.redirect('https://algo-trader-chi.vercel.app/dashboard/settings');
    
  } catch (error) {
    logger.error('FYERS callback error', { 
      error: error.message,
      stack: error.stack,
      query: req.query 
    });
    return res.status(500).json({ 
      error: 'Failed to complete FYERS auth',
      details: error.message 
    });
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
