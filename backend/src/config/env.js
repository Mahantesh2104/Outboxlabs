const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const config = {
  port: parseInt(process.env.PORT || '4000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  jwtSecret: process.env.JWT_SECRET || 'super_secret_outbox_jwt_key_change_in_prod',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',

  databaseUrl:
    process.env.DATABASE_URL ||
    'postgresql://postgres:postgrespassword@localhost:5432/outbox_scheduler',

  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
  },

  ethereal: {
    host: process.env.ETHEREAL_HOST || 'smtp.ethereal.email',
    port: parseInt(process.env.ETHEREAL_PORT || '587', 10),
    user: process.env.ETHEREAL_USER || '',
    pass: process.env.ETHEREAL_PASS || '',
    senderName: process.env.SENDER_NAME || 'Outbox Scheduler',
    senderEmail: process.env.SENDER_EMAIL || 'scheduler@outbox.example.com',
  },

  queue: {
    name: 'outbox-email-queue',
    workerConcurrency: parseInt(process.env.WORKER_CONCURRENCY || '5', 10),
    rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX || '10', 10),
    rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
    minSendDelayMs: parseInt(process.env.MIN_SEND_DELAY_MS || '500', 10),
  },

  apiRateLimitMax: parseInt(process.env.API_RATE_LIMIT_MAX || '200', 10),
};

module.exports = config;
