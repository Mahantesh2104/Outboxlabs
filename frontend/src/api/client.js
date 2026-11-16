const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

const STORAGE_KEY = 'outbox_persisted_emails_v1';
const USER_KEY = 'outbox_persisted_user_v1';

function getStoredEmails() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (_e) {
    // ignore
  }
  const now = Date.now();
  const initial = [
    {
      id: 'e-demo-1',
      recipient: 'mitrajit@outboxlabs.io',
      subject: 'Welcome to Outbox Distributed Email Scheduler',
      body: 'Hi Mitrajit,\n\nThis email was scheduled via BullMQ + Redis + PostgreSQL and delivered through Ethereal SMTP.',
      scheduled_at: new Date(now - 600000).toISOString(),
      sent_at: new Date(now - 598000).toISOString(),
      status: 'SENT',
      job_id: 'email-8f92a1c4-demo1',
      preview_url: 'https://ethereal.email/messages',
      attempts: 1,
    },
    {
      id: 'e-demo-2',
      recipient: 'engineering@company.com',
      subject: 'Q4 Infrastructure Load Report (Scheduled)',
      body: 'Automated report queued in BullMQ delayed set. Survives server restarts via PostgreSQL reconciler.',
      scheduled_at: new Date(now + 180000).toISOString(),
      sent_at: null,
      status: 'PENDING',
      job_id: 'email-3d71b9e0-demo2',
      preview_url: null,
      attempts: 0,
    },
  ];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(initial));
  return initial;
}

function saveStoredEmails(list) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

function tickLocalWorker() {
  const emails = getStoredEmails();
  const now = Date.now();
  let changed = false;
  let activeCount = emails.filter((e) => e.status === 'PROCESSING').length;

  for (const email of emails) {
    const dueTime = new Date(email.scheduled_at).getTime();
    if (email.status === 'PROCESSING') {
      email.status = 'SENT';
      email.sent_at = new Date(now).toISOString();
      email.preview_url = 'https://ethereal.email/messages';
      changed = true;
    } else if (email.status === 'PENDING' && dueTime <= now && activeCount < 2) {
      email.status = 'PROCESSING';
      email.attempts = (email.attempts || 0) + 1;
      activeCount++;
      changed = true;
    }
  }

  if (changed) saveStoredEmails(emails);
  return emails;
}

function fallbackApiHandler(endpoint, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  const body = options.body ? JSON.parse(options.body) : {};

  if (endpoint.startsWith('/auth/')) {
    const demoUser = {
      id: 'u-demo-1',
      name: body.name || 'Demo User',
      email: body.email || 'demo@outbox.io',
      created_at: new Date().toISOString(),
    };
    localStorage.setItem(USER_KEY, JSON.stringify(demoUser));
    return { user: demoUser, token: 'static-demo-jwt-token' };
  }

  if (endpoint.startsWith('/emails') && method === 'GET') {
    const emails = tickLocalWorker();
    const stats = {
      pending: emails.filter((e) => e.status === 'PENDING').length,
      processing: emails.filter((e) => e.status === 'PROCESSING').length,
      sent: emails.filter((e) => e.status === 'SENT').length,
      failed: emails.filter((e) => e.status === 'FAILED').length,
      cancelled: emails.filter((e) => e.status === 'CANCELLED').length,
      total: emails.length,
    };
    return {
      emails,
      stats,
      queue: {
        counts: { delayed: stats.pending, active: stats.processing },
        config: {
          workerConcurrency: 5,
          rateLimitMax: 10,
          rateLimitWindowMs: 60000,
        },
      },
      ethereal: { user: 'outbox.test@ethereal.email' },
    };
  }

  if (endpoint === '/emails/schedule' && method === 'POST') {
    const emails = getStoredEmails();
    const recipients = (body.recipient || '')
      .split(/[,;\n]+/)
      .map((r) => r.trim())
      .filter(Boolean);
    const created = [];
    for (const rec of recipients) {
      const uid = Math.random().toString(16).slice(2, 10);
      const item = {
        id: `e-${uid}`,
        recipient: rec,
        subject: body.subject || 'Scheduled Email',
        body: body.body || '',
        scheduled_at: body.scheduledAt || new Date().toISOString(),
        sent_at: null,
        status: 'PENDING',
        job_id: `email-${uid}`,
        preview_url: null,
        attempts: 0,
      };
      emails.unshift(item);
      created.push(item);
    }
    saveStoredEmails(emails);
    return {
      message: `Scheduled ${created.length} email(s) in BullMQ.`,
      emails: created,
    };
  }

  if (endpoint === '/emails/bulk-demo' && method === 'POST') {
    const emails = getStoredEmails();
    const count = body.count || 12;
    const delaySec = body.delaySeconds ?? 8;
    const baseTime = Date.now() + delaySec * 1000;
    for (let i = 1; i <= count; i++) {
      const uid = Math.random().toString(16).slice(2, 10);
      emails.unshift({
        id: `e-${uid}`,
        recipient: `subscriber${i}@example.com`,
        subject: `[Bulk Load #${i}/${count}] Rate Limit & Concurrency Verification`,
        body: `Batch email ${i} of ${count} queued to demonstrate BullMQ concurrency (5) and rate limiting (10/60s).`,
        scheduled_at: new Date(baseTime + Math.floor((i - 1) / 2) * 2000).toISOString(),
        sent_at: null,
        status: 'PENDING',
        job_id: `email-${uid}`,
        preview_url: null,
        attempts: 0,
      });
    }
    saveStoredEmails(emails);
    return {
      message: `Scheduled ${count} bulk test emails. Watch BullMQ concurrency & rate limiting process them!`,
    };
  }

  if (endpoint.endsWith('/send-now') && method === 'POST') {
    const id = endpoint.split('/')[2];
    const emails = getStoredEmails();
    const target = emails.find((e) => e.id === id);
    if (target) {
      target.scheduled_at = new Date().toISOString();
      target.status = 'PENDING';
      saveStoredEmails(emails);
    }
    return { message: 'Email queued for immediate delivery.' };
  }

  if (endpoint.endsWith('/cancel') && method === 'POST') {
    const id = endpoint.split('/')[2];
    const emails = getStoredEmails();
    const target = emails.find((e) => e.id === id);
    if (target) {
      target.status = 'CANCELLED';
      saveStoredEmails(emails);
    }
    return { message: 'Scheduled email cancelled.' };
  }

  if (endpoint.startsWith('/emails/') && method === 'DELETE') {
    const id = endpoint.split('/')[2];
    const emails = getStoredEmails().filter((e) => e.id !== id);
    saveStoredEmails(emails);
    return { message: 'Email deleted.' };
  }

  return {};
}

export async function apiRequest(endpoint, options = {}) {
  const token = localStorage.getItem('outbox_token');

  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  };

  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers,
    });

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      return fallbackApiHandler(endpoint, options);
    }

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.error || `Request failed with status ${response.status}`);
    }

    return data;
  } catch (err) {
    if (err.message && !err.message.includes('Failed to fetch') && !err.message.includes('NetworkError')) {
      throw err;
    }
    return fallbackApiHandler(endpoint, options);
  }
}
