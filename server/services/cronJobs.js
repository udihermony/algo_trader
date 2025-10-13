const cron = require('node-cron');
const db = require('../config/database');
const fyersAPI = require('../services/fyersAPI');
const logger = require('../utils/logger');
const orderExecutionService = require('../services/orderExecutionService');

class CronJobs {
  constructor() {
    this.jobs = [];
  }

  start() {
    logger.info('Starting cron jobs...');

    // Monitor order status every 30 seconds
    this.jobs.push(
      cron.schedule('*/30 * * * * *', async () => {
        await this.monitorOrderStatus();
      })
    );

    // Update position prices every minute during market hours
    this.jobs.push(
      cron.schedule('* * * * *', async () => {
        await this.updatePositionPrices();
      })
    );

    // Generate daily reports at 6 PM
    this.jobs.push(
      cron.schedule('0 18 * * *', async () => {
        await this.generateDailyReport();
      })
    );

    // Clean up old logs weekly
    this.jobs.push(
      cron.schedule('0 0 * * 0', async () => {
        await this.cleanupOldLogs();
      })
    );

    logger.info(`Started ${this.jobs.length} cron jobs`);
  }

  stop() {
    this.jobs.forEach(job => job.stop());
    logger.info('Stopped all cron jobs');
  }

  async monitorOrderStatus() {
    try {
      // Get pending orders
      const orders = await db.query(
        'SELECT * FROM orders WHERE status IN ($1, $2) AND fyers_order_id IS NOT NULL',
        ['PENDING', 'SUBMITTED']
      );

      for (const order of orders.rows) {
        try {
          await orderExecutionService.monitorOrderStatus(order.id);
        } catch (error) {
          logger.error('Error monitoring order', {
            orderId: order.id,
            error: error.message
          });
        }
      }
    } catch (error) {
      logger.error('Order monitoring cron error', { error: error.message });
    }
  }

  async updatePositionPrices() {
    try {
      // Check if market is open (simplified check)
      const now = new Date();
      const hour = now.getHours();
      const minute = now.getMinutes();
      const currentTime = hour * 60 + minute;
      
      // Market hours: 9:15 AM to 3:30 PM
      const marketStart = 9 * 60 + 15; // 9:15 AM
      const marketEnd = 15 * 60 + 30;   // 3:30 PM
      
      if (currentTime < marketStart || currentTime > marketEnd) {
        return; // Market is closed
      }

      // Get active positions
      const positions = await db.query(
        'SELECT DISTINCT symbol FROM positions WHERE is_active = true'
      );

      if (positions.rows.length === 0) {
        return;
      }

      // Get users with Fyers credentials
      const users = await db.query(
        'SELECT user_id, fyers_credentials FROM settings WHERE fyers_credentials IS NOT NULL'
      );

      for (const user of users.rows) {
        try {
          const credentials = JSON.parse(user.fyers_credentials);
          const symbols = positions.rows.map(p => p.symbol);
          
          const marketData = await fyersAPI.getMarketData(credentials.accessToken, symbols);
          
          // Update position prices
          for (const symbol in marketData) {
            const price = marketData[symbol].last_price;
            
            await db.query(
              `UPDATE positions 
               SET current_price = $1, 
                   unrealized_pnl = (current_price - avg_price) * quantity
               WHERE symbol = $2 AND user_id = $3 AND is_active = true`,
              [price, symbol, user.user_id]
            );
          }
        } catch (error) {
          logger.error('Error updating position prices', {
            userId: user.user_id,
            error: error.message
          });
        }
      }
    } catch (error) {
      logger.error('Position price update cron error', { error: error.message });
    }
  }

  async generateDailyReport() {
    try {
      logger.info('Generating daily report...');
      
      // Get all users
      const users = await db.query('SELECT id, email FROM users WHERE is_active = true');
      
      for (const user of users.rows) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        // Get today's trades
        const trades = await db.query(
          `SELECT symbol, side, quantity, price, pnl, charges
           FROM trades 
           WHERE user_id = $1 AND executed_at >= $2
           ORDER BY executed_at DESC`,
          [user.id, today]
        );
        
        // Calculate summary
        const summary = trades.rows.reduce((acc, trade) => {
          acc.totalPnL += parseFloat(trade.pnl);
          acc.totalCharges += parseFloat(trade.charges);
          acc.tradeCount += 1;
          return acc;
        }, { totalPnL: 0, totalCharges: 0, tradeCount: 0 });
        
        // Log daily summary
        logger.info('Daily trading summary', {
          userId: user.id,
          email: user.email,
          date: today.toISOString().split('T')[0],
          totalPnL: summary.totalPnL,
          totalCharges: summary.totalCharges,
          tradeCount: summary.tradeCount
        });
      }
    } catch (error) {
      logger.error('Daily report generation error', { error: error.message });
    }
  }

  async cleanupOldLogs() {
    try {
      // Delete logs older than 30 days
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      const result = await db.query(
        'DELETE FROM system_logs WHERE created_at < $1',
        [thirtyDaysAgo]
      );
      
      logger.info('Cleaned up old logs', { deletedCount: result.rowCount });
    } catch (error) {
      logger.error('Log cleanup error', { error: error.message });
    }
  }
}

module.exports = new CronJobs();
