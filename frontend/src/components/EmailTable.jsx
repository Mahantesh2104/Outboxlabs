import React, { useState, useEffect } from 'react';
import {
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  ExternalLink,
  Play,
  Ban,
  Trash2,
  Eye,
  MailOpen,
} from 'lucide-react';

function StatusBadge({ status }) {
  const styles = {
    PENDING: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
    PROCESSING: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30 animate-pulse',
    SENT: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
    FAILED: 'bg-rose-500/10 text-rose-300 border-rose-500/30',
    CANCELLED: 'bg-slate-800 text-slate-400 border-slate-700',
  };

  const icons = {
    PENDING: Clock,
    PROCESSING: Loader2,
    SENT: CheckCircle2,
    FAILED: XCircle,
    CANCELLED: Ban,
  };

  const Icon = icons[status] || Clock;

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${
        styles[status] || styles.PENDING
      }`}
    >
      <Icon className={`w-3.5 h-3.5 ${status === 'PROCESSING' ? 'animate-spin' : ''}`} />
      {status}
    </span>
  );
}

function formatCountdown(scheduledAt, status, now) {
  if (status !== 'PENDING') return null;
  const diffSec = Math.round((new Date(scheduledAt).getTime() - now) / 1000);
  if (diffSec <= 0) return 'Due now (queued in worker)';
  if (diffSec < 60) return `in ${diffSec}s`;
  const mins = Math.floor(diffSec / 60);
  const secs = diffSec % 60;
  if (mins < 60) return `in ${mins}m ${secs}s`;
  const hours = Math.floor(mins / 60);
  return `in ${hours}h ${mins % 60}m`;
}

export default function EmailTable({
  emails,
  activeTab,
  onSendNow,
  onCancel,
  onDelete,
  onSelectEmail,
}) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  if (!emails || emails.length === 0) {
    return (
      <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-12 text-center">
        <div className="w-12 h-12 rounded-2xl bg-slate-800/80 border border-slate-700 flex items-center justify-center mx-auto mb-3">
          <MailOpen className="w-6 h-6 text-slate-400" />
        </div>
        <h3 className="text-sm font-semibold text-slate-200">
          {activeTab === 'scheduled'
            ? 'No Scheduled (Pending) Emails'
            : activeTab === 'sent'
            ? 'No Sent Emails Yet'
            : 'No Emails Found'}
        </h3>
        <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
          {activeTab === 'scheduled'
            ? 'Click "Compose & Schedule" or "Simulate Bulk Load (12)" above to queue future emails into BullMQ.'
            : 'Once scheduled emails reach their target time, BullMQ dispatches them via Ethereal SMTP and they appear here.'}
        </p>
      </div>
    );
  }

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-800 bg-slate-950/60 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              <th className="py-3.5 px-4">Recipient</th>
              <th className="py-3.5 px-4">Subject & Preview</th>
              <th className="py-3.5 px-4">Scheduled For</th>
              <th className="py-3.5 px-4">
                {activeTab === 'scheduled' ? 'BullMQ Job ID' : 'Sent Timestamp'}
              </th>
              <th className="py-3.5 px-4">Status</th>
              <th className="py-3.5 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/70 text-sm">
            {emails.map((email) => {
              const countdown = formatCountdown(email.scheduled_at, email.status, now);

              return (
                <tr
                  key={email.id}
                  className="hover:bg-slate-800/40 transition group"
                >
                  {/* Recipient */}
                  <td className="py-3.5 px-4 font-medium text-slate-200 whitespace-nowrap">
                    {email.recipient}
                  </td>

                  {/* Subject & Body Snippet */}
                  <td className="py-3.5 px-4 max-w-xs">
                    <div className="font-medium text-white truncate">{email.subject}</div>
                    <div className="text-xs text-slate-400 truncate mt-0.5">{email.body}</div>
                    {email.error_message && (
                      <div className="text-[11px] text-rose-400 mt-1 truncate">
                        Error: {email.error_message}
                      </div>
                    )}
                  </td>

                  {/* Scheduled Time + Live Countdown */}
                  <td className="py-3.5 px-4 whitespace-nowrap text-xs text-slate-300">
                    <div>{new Date(email.scheduled_at).toLocaleString()}</div>
                    {countdown && (
                      <span className="inline-block mt-1 text-[11px] font-mono text-amber-400 bg-amber-950/60 border border-amber-800/50 px-1.5 py-0.5 rounded">
                        {countdown}
                      </span>
                    )}
                  </td>

                  {/* Job ID or Sent At + Ethereal Preview Link */}
                  <td className="py-3.5 px-4 whitespace-nowrap text-xs">
                    {activeTab === 'scheduled' ? (
                      <span className="font-mono text-slate-400 bg-slate-950 px-2 py-1 rounded border border-slate-800">
                        {email.job_id ? email.job_id.slice(0, 18) + '...' : 'N/A'}
                      </span>
                    ) : (
                      <div>
                        <div className="text-slate-300">
                          {email.sent_at
                            ? new Date(email.sent_at).toLocaleString()
                            : '—'}
                        </div>
                        {email.preview_url && (
                          <a
                            href={email.preview_url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] font-medium text-indigo-400 hover:text-indigo-300 mt-1"
                          >
                            <span>View in Ethereal</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </div>
                    )}
                  </td>

                  {/* Status Badge */}
                  <td className="py-3.5 px-4 whitespace-nowrap">
                    <StatusBadge status={email.status} />
                  </td>

                  {/* Actions */}
                  <td className="py-3.5 px-4 whitespace-nowrap text-right">
                    <div className="inline-flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => onSelectEmail(email)}
                        title="Inspect Email & Queue Metadata"
                        className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>

                      {(email.status === 'PENDING' || email.status === 'FAILED') && (
                        <button
                          type="button"
                          onClick={() => onSendNow(email.id)}
                          title="Send Immediately"
                          className="p-1.5 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-300 border border-indigo-500/30 transition"
                        >
                          <Play className="w-3.5 h-3.5" />
                        </button>
                      )}

                      {email.status === 'PENDING' && (
                        <button
                          type="button"
                          onClick={() => onCancel(email.id)}
                          title="Cancel Scheduled Email"
                          className="p-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 transition"
                        >
                          <Ban className="w-3.5 h-3.5" />
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => onDelete(email.id)}
                        title="Delete Record"
                        className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/25 text-rose-300 border border-rose-500/25 transition"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
