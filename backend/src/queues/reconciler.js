const db = require('../config/db');
const { emailQueue, scheduleEmailJob } = require('./emailQueue');

/**
 * Startup Persistence & Crash Recovery Reconciler:
 * Ensures that if the Node.js process or Redis restarts/crashes, any emails stored
 * in PostgreSQL with status 'PENDING' or 'PROCESSING' are verified in BullMQ and
 * automatically re-queued with their remaining delay (or sent immediately if overdue).
 */
async function reconcilePendingEmails() {
  console.log('[Reconciler] Checking PostgreSQL for pending or interrupted emails...');

  const result = await db.query(
    `SELECT * FROM scheduled_emails
     WHERE status IN ('PENDING', 'PROCESSING')
     ORDER BY scheduled_at ASC`
  );

  if (result.rowCount === 0) {
    console.log('[Reconciler] No pending emails require recovery.');
    return { checked: 0, requeued: 0 };
  }

  let requeuedCount = 0;

  for (const email of result.rows) {
    const jobId = email.job_id || `email-${email.id}`;
    const existingJob = await emailQueue.getJob(jobId);

    let needsRequeue = false;

    if (!existingJob) {
      needsRequeue = true;
    } else {
      const state = await existingJob.getState();
      // If a job failed or got stuck in an invalid state while DB still says PENDING/PROCESSING
      if (state === 'failed' || state === 'completed') {
        needsRequeue = true;
      }
    }

    // If an email was stuck in PROCESSING during a server crash and isn't actively running, reset to PENDING
    if (email.status === 'PROCESSING') {
      await db.query(
        `UPDATE scheduled_emails SET status = 'PENDING', updated_at = NOW() WHERE id = $1`,
        [email.id]
      );
    }

    if (needsRequeue) {
      await scheduleEmailJob(email);
      await db.query(
        `UPDATE scheduled_emails SET job_id = $2, status = 'PENDING', updated_at = NOW() WHERE id = $1`,
        [email.id, jobId]
      );
      requeuedCount++;
    }
  }

  console.log(
    `[Reconciler] Checked ${result.rowCount} pending email(s); re-queued ${requeuedCount} missing/interrupted job(s).`
  );

  return {
    checked: result.rowCount,
    requeued: requeuedCount,
  };
}

module.exports = {
  reconcilePendingEmails,
};
