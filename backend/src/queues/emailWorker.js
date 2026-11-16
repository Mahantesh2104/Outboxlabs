const { Worker } = require('bullmq');
const config = require('../config/env');
const { createRedisConnection } = require('../config/redis');
const db = require('../config/db');
const { sendEmail } = require('../config/mailer');

let workerInstance = null;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Starts the BullMQ Worker with configured concurrency and rate limiting.
 * - `concurrency`: maximum number of emails processed in parallel.
 * - `limiter`: maximum number of jobs processed per time window (`max` per `duration` ms).
 */
function startEmailWorker() {
  if (workerInstance) return workerInstance;

  const workerConnection = createRedisConnection('queue-worker');

  workerInstance = new Worker(
    config.queue.name,
    async (job) => {
      const { emailId } = job.data;

      // 1. Fetch & atomically lock the email record if it is still PENDING or PROCESSING
      const lockResult = await db.query(
        `UPDATE scheduled_emails
         SET status = 'PROCESSING',
             attempts = attempts + 1,
             updated_at = NOW()
         WHERE id = $1 AND status IN ('PENDING', 'PROCESSING')
         RETURNING *`,
        [emailId]
      );

      if (lockResult.rowCount === 0) {
        // Email was already SENT or CANCELLED (idempotency protection)
        console.log(`[Worker] Skipping job ${job.id} — email ${emailId} is already processed or cancelled.`);
        return { skipped: true };
      }

      const emailRecord = lockResult.rows[0];

      // 2. Enforce minimum pacing delay between sends to protect SMTP downstream under bulk load
      if (config.queue.minSendDelayMs > 0) {
        await sleep(config.queue.minSendDelayMs);
      }

      try {
        // 3. Dispatch email via Nodemailer + Ethereal SMTP
        const { messageId, previewUrl } = await sendEmail({
          to: emailRecord.recipient,
          subject: emailRecord.subject,
          text: emailRecord.body,
        });

        // 4. Persist SENT state and Ethereal preview URL in PostgreSQL
        await db.query(
          `UPDATE scheduled_emails
           SET status = 'SENT',
               sent_at = NOW(),
               message_id = $2,
               preview_url = $3,
               error_message = NULL,
               updated_at = NOW()
           WHERE id = $1`,
          [emailId, messageId, previewUrl]
        );

        console.log(
          `[Worker] Sent email ${emailId} to ${emailRecord.recipient} | Preview: ${previewUrl || 'N/A'}`
        );

        return {
          emailId,
          messageId,
          previewUrl,
        };
      } catch (err) {
        const maxAttempts = job.opts.attempts || 3;
        const isFinalAttempt = job.attemptsMade + 1 >= maxAttempts;
        const nextStatus = isFinalAttempt ? 'FAILED' : 'PENDING';

        await db.query(
          `UPDATE scheduled_emails
           SET status = $2,
               error_message = $3,
               updated_at = NOW()
           WHERE id = $1`,
          [emailId, nextStatus, err.message]
        );

        console.error(
          `[Worker] Error sending email ${emailId} (Attempt ${job.attemptsMade + 1}/${maxAttempts}):`,
          err.message
        );
        throw err;
      }
    },
    {
      connection: workerConnection,
      concurrency: config.queue.workerConcurrency,
      limiter: {
        max: config.queue.rateLimitMax,
        duration: config.queue.rateLimitWindowMs,
      },
    }
  );

  workerInstance.on('completed', (job) => {
    console.log(`[Worker] Job ${job.id} completed successfully.`);
  });

  workerInstance.on('failed', (job, err) => {
    console.error(`[Worker] Job ${job ? job.id : 'unknown'} failed: ${err.message}`);
  });

  console.log(
    `[Worker] Started BullMQ worker on queue "${config.queue.name}" | Concurrency: ${config.queue.workerConcurrency} | Rate Limit: ${config.queue.rateLimitMax} emails / ${config.queue.rateLimitWindowMs}ms`
  );

  return workerInstance;
}

module.exports = {
  startEmailWorker,
};
