const express = require('express');
const cors = require('cors');
const config = require('./config/env');
const { initDatabase } = require('./config/db');
const { initMailer, getEtherealAccountInfo } = require('./config/mailer');
const { apiLimiter } = require('./middleware/rateLimiter');
const { startEmailWorker } = require('./queues/emailWorker');
const { reconcilePendingEmails } = require('./queues/reconciler');
const { getQueueMetrics } = require('./queues/emailQueue');
const authRoutes = require('./routes/authRoutes');
const emailRoutes = require('./routes/emailRoutes');

const app = express();

app.use(
  cors({
    origin: [config.frontendUrl, 'http://localhost:5173', 'http://localhost:3000'],
    credentials: true,
  })
);
app.use(express.json({ limit: '1mb' }));
app.use('/api', apiLimiter);

// Health & Architecture Status Endpoint
app.get('/api/health', async (_req, res) => {
  try {
    const queue = await getQueueMetrics();
    const ethereal = getEtherealAccountInfo();
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      queue,
      ethereal,
    });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/emails', emailRoutes);

async function bootstrap() {
  try {
    console.log('--------------------------------------------------------------');
    console.log('Starting Outbox Email Scheduler Backend...');
    console.log('--------------------------------------------------------------');

    // 1. Initialize PostgreSQL schema & default demo user
    await initDatabase();

    // 2. Initialize Ethereal SMTP transporter
    await initMailer();

    // 3. Start BullMQ Worker with Concurrency & Rate Limiting
    startEmailWorker();

    // 4. Reconcile any pending/interrupted emails from PostgreSQL into BullMQ
    await reconcilePendingEmails();

    // 5. Start HTTP Server
    app.listen(config.port, () => {
      console.log('--------------------------------------------------------------');
      console.log(`[Server] Express API listening on http://localhost:${config.port}`);
      console.log(`[Server] Worker Concurrency : ${config.queue.workerConcurrency}`);
      console.log(
        `[Server] Rate Limiting      : Max ${config.queue.rateLimitMax} emails per ${
          config.queue.rateLimitWindowMs / 1000
        }s window`
      );
      console.log('--------------------------------------------------------------');
    });
  } catch (err) {
    console.error('[Bootstrap] Fatal startup error:', err);
    process.exit(1);
  }
}

bootstrap();
