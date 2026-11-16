const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../config/db');
const { authenticateToken } = require('../middleware/auth');
const { scheduleEndpointLimiter } = require('../middleware/rateLimiter');
const {
  scheduleEmailJob,
  cancelEmailJob,
  getQueueMetrics,
} = require('../queues/emailQueue');
const { getEtherealAccountInfo } = require('../config/mailer');

const router = express.Router();

router.use(authenticateToken);

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * GET /api/emails
 * Fetches scheduled & sent emails for the logged-in user along with stats and BullMQ metrics.
 */
router.get('/', async (req, res) => {
  try {
    const { filter } = req.query; // 'scheduled' | 'sent' | 'all'
    let statusCondition = '';

    if (filter === 'scheduled') {
      statusCondition = `AND status IN ('PENDING', 'PROCESSING')`;
    } else if (filter === 'sent') {
      statusCondition = `AND status IN ('SENT', 'FAILED', 'CANCELLED')`;
    }

    const emailsResult = await db.query(
      `SELECT *
       FROM scheduled_emails
       WHERE user_id = $1 ${statusCondition}
       ORDER BY
         CASE WHEN status IN ('PENDING', 'PROCESSING') THEN scheduled_at END ASC,
         CASE WHEN status NOT IN ('PENDING', 'PROCESSING') THEN COALESCE(sent_at, updated_at) END DESC`,
      [req.user.id]
    );

    const statsResult = await db.query(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'PENDING')::int AS pending,
         COUNT(*) FILTER (WHERE status = 'PROCESSING')::int AS processing,
         COUNT(*) FILTER (WHERE status = 'SENT')::int AS sent,
         COUNT(*) FILTER (WHERE status = 'FAILED')::int AS failed,
         COUNT(*) FILTER (WHERE status = 'CANCELLED')::int AS cancelled,
         COUNT(*)::int AS total
       FROM scheduled_emails
       WHERE user_id = $1`,
      [req.user.id]
    );

    const queueMetrics = await getQueueMetrics();
    const etherealInfo = getEtherealAccountInfo();

    return res.json({
      emails: emailsResult.rows,
      stats: statsResult.rows[0],
      queue: queueMetrics,
      ethereal: etherealInfo,
    });
  } catch (err) {
    console.error('[Emails] Error fetching emails:', err.message);
    return res.status(500).json({ error: 'Failed to fetch emails.' });
  }
});

/**
 * POST /api/emails/schedule
 * Schedules one or more emails to be sent at a future timestamp.
 * Supports comma/newline-separated recipients in `recipient` for bulk scheduling.
 */
router.post('/schedule', scheduleEndpointLimiter, async (req, res) => {
  try {
    const { recipient, recipients, subject, body, scheduledAt } = req.body;

    // Parse single or multiple recipients
    let recipientList = [];
    if (Array.isArray(recipients)) {
      recipientList = recipients;
    } else if (typeof recipient === 'string') {
      recipientList = recipient
        .split(/[,;\n]+/)
        .map((r) => r.trim())
        .filter(Boolean);
    }

    if (recipientList.length === 0) {
      return res.status(400).json({ error: 'At least one valid recipient email is required.' });
    }

    const invalidEmails = recipientList.filter((r) => !EMAIL_REGEX.test(r));
    if (invalidEmails.length > 0) {
      return res.status(400).json({
        error: `Invalid recipient email address(es): ${invalidEmails.join(', ')}`,
      });
    }

    if (!subject || !subject.trim()) {
      return res.status(400).json({ error: 'Email subject is required.' });
    }

    if (!body || !body.trim()) {
      return res.status(400).json({ error: 'Email body is required.' });
    }

    const parsedScheduleDate = scheduledAt ? new Date(scheduledAt) : new Date();
    if (isNaN(parsedScheduleDate.getTime())) {
      return res.status(400).json({ error: 'Invalid scheduledAt date/time.' });
    }

    const createdEmails = [];

    for (const targetEmail of recipientList) {
      const id = uuidv4();
      const jobId = `email-${id}`;

      // 1. Persist to PostgreSQL first so it survives any crash
      const insertResult = await db.query(
        `INSERT INTO scheduled_emails
          (id, user_id, recipient, subject, body, scheduled_at, status, job_id)
         VALUES ($1, $2, $3, $4, $5, $6, 'PENDING', $7)
         RETURNING *`,
        [
          id,
          req.user.id,
          targetEmail,
          subject.trim(),
          body.trim(),
          parsedScheduleDate.toISOString(),
          jobId,
        ]
      );

      const emailRecord = insertResult.rows[0];

      // 2. Enqueue delayed job in BullMQ (backed by Redis)
      await scheduleEmailJob(emailRecord);
      createdEmails.push(emailRecord);
    }

    return res.status(201).json({
      message:
        createdEmails.length === 1
          ? 'Email scheduled successfully.'
          : `${createdEmails.length} emails scheduled successfully.`,
      emails: createdEmails,
    });
  } catch (err) {
    console.error('[Emails] Error scheduling email:', err.message);
    return res.status(500).json({ error: 'Failed to schedule email.' });
  }
});

/**
 * POST /api/emails/bulk-demo
 * Schedules a batch of demo emails (default 12) to demonstrate BullMQ concurrency
 * and rate-limiting behavior under bulk load.
 */
router.post('/bulk-demo', scheduleEndpointLimiter, async (req, res) => {
  try {
    const count = Math.min(Math.max(parseInt(req.body.count || '12', 10), 2), 30);
    const delaySeconds = parseInt(req.body.delaySeconds ?? '10', 10);
    const scheduledTime = new Date(Date.now() + delaySeconds * 1000);

    const createdEmails = [];

    for (let i = 1; i <= count; i++) {
      const id = uuidv4();
      const jobId = `email-${id}`;
      const recipient = `recipient${i}@example.com`;
      const subject = `[Bulk Load Test #${i}/${count}] Rate Limit & Concurrency Verification`;
      const body = `Hello Subscriber #${i},\n\nThis email was queued as part of a ${count}-email bulk load batch to demonstrate BullMQ worker concurrency and rate limiting with Ethereal SMTP.\n\nScheduled at: ${scheduledTime.toISOString()}\nBatch item: ${i} of ${count}`;

      const insertResult = await db.query(
        `INSERT INTO scheduled_emails
          (id, user_id, recipient, subject, body, scheduled_at, status, job_id)
         VALUES ($1, $2, $3, $4, $5, $6, 'PENDING', $7)
         RETURNING *`,
        [
          id,
          req.user.id,
          recipient,
          subject,
          body,
          scheduledTime.toISOString(),
          jobId,
        ]
      );

      const emailRecord = insertResult.rows[0];
      await scheduleEmailJob(emailRecord);
      createdEmails.push(emailRecord);
    }

    return res.status(201).json({
      message: `Scheduled ${createdEmails.length} bulk test emails for ${scheduledTime.toLocaleTimeString()}.`,
      emails: createdEmails,
    });
  } catch (err) {
    console.error('[Emails] Error scheduling bulk demo:', err.message);
    return res.status(500).json({ error: 'Failed to schedule bulk demo emails.' });
  }
});

/**
 * POST /api/emails/:id/send-now
 * Immediately dispatches a pending or failed email by setting scheduled_at to NOW() and delay to 0.
 */
router.post('/:id/send-now', async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await db.query(
      'SELECT * FROM scheduled_emails WHERE id = $1 AND user_id = $2',
      [id, req.user.id]
    );

    if (existing.rowCount === 0) {
      return res.status(404).json({ error: 'Email not found.' });
    }

    const emailRecord = existing.rows[0];
    if (emailRecord.status === 'SENT' || emailRecord.status === 'PROCESSING') {
      return res.status(400).json({ error: `Email is already ${emailRecord.status}.` });
    }

    const updatedResult = await db.query(
      `UPDATE scheduled_emails
       SET scheduled_at = NOW(),
           status = 'PENDING',
           error_message = NULL,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id]
    );

    const updatedEmail = updatedResult.rows[0];
    await scheduleEmailJob(updatedEmail);

    return res.json({
      message: 'Email queued for immediate delivery.',
      email: updatedEmail,
    });
  } catch (err) {
    console.error('[Emails] Error triggering send-now:', err.message);
    return res.status(500).json({ error: 'Failed to trigger immediate send.' });
  }
});

/**
 * POST /api/emails/:id/cancel
 * Cancels a PENDING scheduled email and removes its job from BullMQ.
 */
router.post('/:id/cancel', async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await db.query(
      'SELECT * FROM scheduled_emails WHERE id = $1 AND user_id = $2',
      [id, req.user.id]
    );

    if (existing.rowCount === 0) {
      return res.status(404).json({ error: 'Email not found.' });
    }

    const emailRecord = existing.rows[0];
    if (emailRecord.status !== 'PENDING') {
      return res.status(400).json({
        error: `Cannot cancel email with status "${emailRecord.status}".`,
      });
    }

    await cancelEmailJob(emailRecord.job_id);

    const updated = await db.query(
      `UPDATE scheduled_emails
       SET status = 'CANCELLED',
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id]
    );

    return res.json({
      message: 'Scheduled email cancelled.',
      email: updated.rows[0],
    });
  } catch (err) {
    console.error('[Emails] Error cancelling email:', err.message);
    return res.status(500).json({ error: err.message || 'Failed to cancel scheduled email.' });
  }
});

/**
 * DELETE /api/emails/:id
 * Deletes an email record and removes any pending BullMQ job.
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await db.query(
      'SELECT * FROM scheduled_emails WHERE id = $1 AND user_id = $2',
      [id, req.user.id]
    );

    if (existing.rowCount === 0) {
      return res.status(404).json({ error: 'Email not found.' });
    }

    const emailRecord = existing.rows[0];
    if (emailRecord.status === 'PENDING' && emailRecord.job_id) {
      await cancelEmailJob(emailRecord.job_id).catch(() => {});
    }

    await db.query('DELETE FROM scheduled_emails WHERE id = $1', [id]);
    return res.json({ message: 'Email deleted.' });
  } catch (err) {
    console.error('[Emails] Error deleting email:', err.message);
    return res.status(500).json({ error: 'Failed to delete email.' });
  }
});

module.exports = router;
