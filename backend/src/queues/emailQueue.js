const { Queue } = require('bullmq');
const config = require('../config/env');
const { createRedisConnection } = require('../config/redis');

const queueConnection = createRedisConnection('queue-producer');

const emailQueue = new Queue(config.queue.name, {
  connection: queueConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 3000,
    },
    removeOnComplete: {
      count: 1000,
      age: 24 * 3600,
    },
    removeOnFail: {
      count: 1000,
    },
  },
});

/**
 * Enqueues an email into BullMQ with a calculated delay based on `scheduled_at`.
 * Uses a deterministic jobId (`email-<uuid>`) for idempotency across server restarts.
 */
async function scheduleEmailJob(emailRecord) {
  const now = Date.now();
  const targetTime = new Date(emailRecord.scheduled_at).getTime();
  const delay = Math.max(0, targetTime - now);
  const jobId = `email-${emailRecord.id}`;

  // Remove any stale job with the same ID if re-scheduling
  const existingJob = await emailQueue.getJob(jobId);
  if (existingJob) {
    const state = await existingJob.getState();
    if (state !== 'active') {
      await existingJob.remove();
    }
  }

  const job = await emailQueue.add(
    'send-scheduled-email',
    {
      emailId: emailRecord.id,
      userId: emailRecord.user_id,
      recipient: emailRecord.recipient,
      subject: emailRecord.subject,
      scheduledAt: emailRecord.scheduled_at,
    },
    {
      jobId,
      delay,
    }
  );

  console.log(
    `[Scheduler] Queued job ${job.id} for ${emailRecord.recipient} | Delay: ${Math.round(
      delay / 1000
    )}s (Scheduled: ${new Date(emailRecord.scheduled_at).toISOString()})`
  );

  return job;
}

/**
 * Removes a pending/delayed job from BullMQ if a user cancels a scheduled email.
 */
async function cancelEmailJob(jobId) {
  if (!jobId) return false;
  const job = await emailQueue.getJob(jobId);
  if (!job) return false;

  const state = await job.getState();
  if (state === 'active') {
    throw new Error('Email is currently being sent and cannot be cancelled.');
  }

  await job.remove();
  console.log(`[Scheduler] Cancelled job ${jobId}`);
  return true;
}

/**
 * Returns live BullMQ queue counts and rate-limit configuration.
 */
async function getQueueMetrics() {
  const counts = await emailQueue.getJobCounts(
    'waiting',
    'active',
    'delayed',
    'completed',
    'failed',
    'paused'
  );

  return {
    counts,
    config: {
      queueName: config.queue.name,
      workerConcurrency: config.queue.workerConcurrency,
      rateLimitMax: config.queue.rateLimitMax,
      rateLimitWindowMs: config.queue.rateLimitWindowMs,
      minSendDelayMs: config.queue.minSendDelayMs,
    },
  };
}

module.exports = {
  emailQueue,
  scheduleEmailJob,
  cancelEmailJob,
  getQueueMetrics,
};
