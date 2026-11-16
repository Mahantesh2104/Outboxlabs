import React, { useState } from 'react';
import { X, Calendar, Send, Users, FileText, Sparkles } from 'lucide-react';

function toLocalDateTimeInputValue(date) {
  const pad = (n) => String(n).padStart(2, '0');
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

export default function ComposeModal({ isOpen, onClose, onSchedule }) {
  const defaultFutureDate = new Date(Date.now() + 2 * 60 * 1000); // +2 minutes by default

  const [recipient, setRecipient] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [scheduledAt, setScheduledAt] = useState(toLocalDateTimeInputValue(defaultFutureDate));
  const [customSecondsOffset, setCustomSecondsOffset] = useState(null); // for sub-minute quick presets
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!isOpen) return null;

  const applyQuickPreset = (secondsFromNow, label) => {
    const target = new Date(Date.now() + secondsFromNow * 1000);
    setScheduledAt(toLocalDateTimeInputValue(target));
    setCustomSecondsOffset({ seconds: secondsFromNow, label, targetIso: target.toISOString() });
  };

  const fillSampleContent = () => {
    setRecipient('alice@example.com, bob@example.com');
    setSubject('Quarterly Product Launch Update — Scheduled Delivery');
    setBody(
      'Hi Team,\n\nThis is a scheduled notification dispatched by our BullMQ + Redis + PostgreSQL email scheduler and delivered via Ethereal SMTP.\n\nBest regards,\nOutbox Platform'
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      const targetIso = customSecondsOffset
        ? new Date(Date.now() + customSecondsOffset.seconds * 1000).toISOString()
        : new Date(scheduledAt).toISOString();

      await onSchedule({
        recipient,
        subject,
        body,
        scheduledAt: targetIso,
      });

      setRecipient('');
      setSubject('');
      setBody('');
      setCustomSecondsOffset(null);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="px-6 py-4 bg-slate-950/60 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center">
              <Send className="w-4 h-4 text-indigo-400" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-white">Schedule New Email</h2>
              <p className="text-xs text-slate-400">
                Persisted in PostgreSQL & queued in BullMQ + Redis
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={fillSampleContent}
              className="px-2.5 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-xs text-indigo-300 flex items-center gap-1 transition"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Auto-Fill Sample
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 rounded-lg bg-rose-950/60 border border-rose-800 text-rose-200 text-xs">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Recipient Email(s){' '}
              <span className="text-slate-500 font-normal">
                (supports comma-separated emails for bulk scheduling)
              </span>
            </label>
            <div className="relative">
              <Users className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
              <input
                type="text"
                required
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                placeholder="recipient@example.com, team@example.com"
                className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">Subject</label>
            <div className="relative">
              <FileText className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
              <input
                type="text"
                required
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Enter email subject line..."
                className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">Message Body</label>
            <textarea
              rows={5}
              required
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Write the email content to be delivered..."
              className="w-full p-3 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white focus:outline-none focus:border-indigo-500 resize-y"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-medium text-slate-300">
                Scheduled Delivery Time
              </label>
              {customSecondsOffset && (
                <span className="text-[11px] text-indigo-400 font-medium">
                  Preset active: {customSecondsOffset.label}
                </span>
              )}
            </div>

            <div className="relative mb-2.5">
              <Calendar className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
              <input
                type="datetime-local"
                required
                value={scheduledAt}
                onChange={(e) => {
                  setScheduledAt(e.target.value);
                  setCustomSecondsOffset(null);
                }}
                className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white focus:outline-none focus:border-indigo-500"
              />
            </div>

            {/* Quick Time Presets */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-slate-500 mr-1">Quick schedule:</span>
              {[
                { label: 'Send Now (0s)', sec: 0 },
                { label: '+15 sec', sec: 15 },
                { label: '+30 sec', sec: 30 },
                { label: '+1 min', sec: 60 },
                { label: '+5 mins', sec: 300 },
                { label: '+1 hour', sec: 3600 },
              ].map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => applyQuickPreset(preset.sec, preset.label)}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium border transition ${
                    customSecondsOffset?.label === preset.label
                      ? 'bg-indigo-600/20 border-indigo-500 text-indigo-300'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-medium flex items-center gap-1.5 shadow-lg shadow-indigo-600/25 transition"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{submitting ? 'Scheduling...' : 'Queue Scheduled Email'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
