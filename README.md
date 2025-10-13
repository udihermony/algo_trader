# Trading Web App

Automated trading web application that connects Chartlink.com screener alerts to Fyers trading account for algorithmic trading.

## 🚀 Features

- **Real-time Alert Processing**: Receive and process Chartlink screener alerts via webhooks
- **Automated Trading**: Execute trades automatically based on configured strategies
- **Fyers Integration**: Full integration with Fyers trading API for order management
- **Strategy Management**: Create and manage multiple trading strategies with risk controls
- **Live Dashboard**: Real-time monitoring of positions, orders, and P&L
- **Risk Management**: Built-in risk controls including position limits and stop-loss
- **Manual Override**: Ability to manually place, modify, or cancel orders
- **Comprehensive Logging**: Detailed logging of all trading activities

## 🏗️ Architecture

```
trading-web-app/
├── client/                 # Next.js frontend application
│   ├── app/               # App router pages
│   ├── components/        # React components
│   ├── contexts/          # React contexts (Auth, Socket)
│   └── styles/           # CSS and styling
├── server/                # Node.js backend API
│   ├── routes/           # API route handlers
│   ├── services/         # Business logic services
│   ├── middleware/       # Express middleware
│   ├── config/          # Configuration files
│   └── utils/           # Utility functions
├── database/            # Database schema and migrations
└── docs/               # Documentation
```

## 🛠️ Tech Stack

### Frontend
- **Next.js 14** - React framework with App Router
- **TypeScript** - Type safety and better development experience
- **TailwindCSS** - Utility-first CSS framework
- **Chart.js** - Data visualization and charts
- **Socket.io Client** - Real-time communication
- **React Hook Form** - Form handling
- **React Hot Toast** - Notifications

### Backend
- **Node.js** - JavaScript runtime
- **Express.js** - Web framework
- **Socket.io** - Real-time bidirectional communication
- **PostgreSQL** - Relational database
- **JWT** - Authentication tokens
- **Winston** - Logging
- **Node-cron** - Scheduled tasks
- **Joi** - Data validation

### External APIs
- **Fyers API** - Trading and market data
- **Chartlink Webhooks** - Alert notifications

## 📋 Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** (v18 or higher)
- **npm** (v8 or higher)
- **PostgreSQL** (v12 or higher)
- **Git**

## 🚀 Quick Setup

### Option 1: Automated Setup (Recommended)

Run the setup script for automated installation:

```bash
./setup.sh
```

### Option 2: Manual Setup

1. **Clone the repository**
```bash
git clone <repository-url>
cd trading-web-app
```

2. **Install dependencies**
```bash
npm run install:all
```

3. **Set up environment variables**
```bash
cp server/env.example server/.env
# Edit server/.env with your configuration
```

4. **Set up PostgreSQL database**
```bash
createdb trading_app
# Or using psql:
psql -c "CREATE DATABASE trading_app;"
```

5. **Run database migrations**
```bash
cd server
npm run db:migrate
cd ..
```

6. **Start development servers**
```bash
npm run dev
```

## ⚙️ Configuration

### Environment Variables

#### Server (.env)
```bash
# Database
DATABASE_URL=postgresql://username:password@localhost:5432/trading_app

# Fyers API
FYERS_APP_ID=your_fyers_app_id
FYERS_SECRET_KEY=your_fyers_secret_key
FYERS_REDIRECT_URI=http://localhost:3001/api/fyers/callback

# JWT
JWT_SECRET=your_super_secret_jwt_key
JWT_EXPIRES_IN=24h

# Webhook Security
WEBHOOK_SECRET=your_chartlink_webhook_secret

# Server
PORT=3001
NODE_ENV=development
```

#### Client (.env.local)
```bash
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_SOCKET_URL=http://localhost:3001
```

### Fyers API Setup

1. **Create Fyers Developer Account**
   - Visit [Fyers Developer Portal](https://myapi.fyers.in/)
   - Create a new app
   - Note down App ID and Secret Key

2. **Configure Redirect URI**
   - Add `http://localhost:3001/api/fyers/callback` to allowed redirect URIs

3. **Update Environment Variables**
   - Add your App ID and Secret Key to `server/.env`

### Chartlink Webhook Setup

1. **Configure Webhook URL**
   - Set webhook URL to: `http://your-domain.com/api/webhook/chartlink`
   - Add webhook secret to `server/.env`

2. **Test Webhook**
   - Use the test endpoint: `POST /api/webhook/chartlink/test`

## 🎯 Usage

### 1. Access the Application

- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:3001

### 2. Default Login Credentials

- **Email**: admin@tradingapp.com
- **Password**: admin123

⚠️ **Important**: Change the default password after first login!

### 3. Connect Fyers Account

1. Go to Settings → Fyers Integration
2. Click "Connect Fyers Account"
3. Complete OAuth flow
4. Your account will be connected automatically

### 4. Create Trading Strategy

1. Navigate to Strategies
2. Click "Create New Strategy"
3. Configure:
   - Symbol filters
   - Position sizing
   - Risk parameters
   - Trading hours
4. Activate the strategy

### 5. Monitor Trading

- **Dashboard**: Overview of positions and P&L
- **Alerts**: Real-time alert feed
- **Orders**: Order management and history
- **Positions**: Current positions and performance

## 📊 API Endpoints

### Authentication
- `POST /api/auth/login` - User login
- `POST /api/auth/register` - User registration
- `GET /api/auth/profile` - Get user profile

### Trading
- `GET /api/fyers/balance` - Get account balance
- `GET /api/fyers/positions` - Get positions
- `POST /api/fyers/orders` - Place order
- `PUT /api/fyers/orders/:id` - Modify order
- `DELETE /api/fyers/orders/:id` - Cancel order

### Alerts & Strategies
- `GET /api/alerts` - Get alerts
- `GET /api/strategies` - Get strategies
- `POST /api/strategies` - Create strategy
- `PUT /api/strategies/:id` - Update strategy

### Webhooks
- `POST /api/webhook/chartlink` - Receive Chartlink alerts
- `POST /api/webhook/chartlink/test` - Test webhook

## 🔒 Security Features

- **JWT Authentication**: Secure token-based authentication
- **Encrypted Credentials**: Fyers credentials are encrypted at rest
- **Webhook Verification**: Signature verification for incoming webhooks
- **Rate Limiting**: API rate limiting to prevent abuse
- **Input Validation**: Comprehensive input validation using Joi
- **HTTPS Enforcement**: SSL/TLS encryption in production
- **CORS Protection**: Cross-origin resource sharing protection

## 📈 Monitoring & Logging

- **Winston Logging**: Structured logging with multiple levels
- **Real-time Monitoring**: Live order and position tracking
- **Error Tracking**: Comprehensive error logging and alerting
- **Performance Metrics**: API response time monitoring
- **Daily Reports**: Automated daily trading summaries

## 🧪 Testing

### Run Tests
```bash
cd server
npm test
```

### Test Webhook
```bash
curl -X POST http://localhost:3001/api/webhook/chartlink/test \
  -H "Content-Type: application/json" \
  -d '{
    "symbol": "RELIANCE",
    "action": "BUY",
    "price": 2500,
    "quantity": 1
  }'
```

## 🚀 Deployment

### Frontend (Vercel)
1. Connect GitHub repository to Vercel
2. Set environment variables in Vercel dashboard
3. Deploy automatically on push to main branch

### Backend (Railway/Render)
1. Connect GitHub repository
2. Set environment variables
3. Configure database connection
4. Deploy

### Database (PostgreSQL)
- **Development**: Local PostgreSQL instance
- **Production**: Managed PostgreSQL service (Railway, Supabase, etc.)

## 🔧 Development

### Available Scripts

```bash
# Install all dependencies
npm run install:all

# Start development servers
npm run dev

# Build client for production
npm run build

# Start production server
npm start

# Run database migrations
cd server && npm run db:migrate

# Run tests
cd server && npm test
```

### Project Structure

- **Client**: Next.js app with TypeScript
- **Server**: Express.js API with comprehensive error handling
- **Database**: PostgreSQL with proper indexing and relationships
- **Real-time**: Socket.io for live updates
- **Logging**: Winston with file and console output

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📝 License

This project is licensed under the MIT License - see the LICENSE file for details.

## ⚠️ Disclaimer

This software is for educational and research purposes only. Trading involves substantial risk of loss and is not suitable for all investors. Past performance is not indicative of future results. Always test thoroughly in a paper trading environment before using with real money.

## 🆘 Support

For support and questions:
- Create an issue on GitHub
- Check the documentation in `/docs`
- Review the API documentation at `/api/docs`

## 🔄 Updates

- **v1.0.0**: Initial release with core trading functionality
- **v1.1.0**: Added advanced strategy management
- **v1.2.0**: Enhanced risk management features
- **v1.3.0**: Real-time dashboard improvements
