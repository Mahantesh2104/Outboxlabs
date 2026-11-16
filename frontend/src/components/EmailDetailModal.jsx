import React from 'react';
import { X, ExternalLink, Mail, Calendar, Hash } from 'lucide-react';

export default function EmailDetailModal({ email, onClose }) {
  if (!email) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
        <div className="px-6 py-4 bg-slate-950/60 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Mail className="w-4 h-4 text-indigo-400" />
            <h3 className="text-sm font-semibold text-white">Email & BullMQ Job Details</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-4 text-xs">
          <div className="grid grid-cols-2 gap-3 bg-slate-950 p-3.5 rounded-xl border border-slate-800">
            <div>
              <span className="text-slate-500 block">Status</span>
              <span className="font-semibold text-slate-200 mt-0.5 block">{email.status}</span>
            </div>
            <div>
              <span className="text-slate-500 block">Delivery Attempts</span>
              <span className="font-semibold text-slate-200 mt-0.5 block">{email.attempts}</span>
            </div>
            <div>
              <span className="text-slate-500 block flex items-center gap-1">
                <Calendar className="w-3 h-3" /> Scheduled At
              </span>
              <span className="text-slate-200 mt-0.5 block">
                {new Date(email.scheduled_at).toLocaleString()}
              </span>
            </div>
            <div>
              <span className="text-slate-500 block">Sent At</span>
              <span className="text-slate-200 mt-0.5 block">
                {email.sent_at ? new Date(email.sent_at).toLocaleString() : 'Not sent yet'}
              </span>
            </div>
            <div className="col-span-2">
              <span className="text-slate-500 block flex items-center gap-1">
                <Hash className="w-3 h-3" /> BullMQ Job ID
              </span>
              <span className="font-mono text-slate-300 mt-0.5 block break-all">
                {email.job_id || 'N/A'}
              </span>
            </div>
          </div>

          <div>
            <span className="text-slate-400 font-medium block mb-1">Recipient</span>
            <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-200">
              {email.recipient}
            </div>
          </div>

          <div>
            <span className="text-slate-400 font-medium block mb-1">Subject</span>
            <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 text-white font-medium">
              {email.subject}
            </div>
          </div>

          <div>
            <span className="text-slate-400 font-medium block mb-1">Body Content</span>
            <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 text-slate-300 whitespace-pre-wrap max-h-48 overflow-y-auto leading-relaxed">
              {email.body}
            </div>
          </div>

          {email.preview_url && (
            <div className="pt-2">
              <a
                href={email.preview_url}
                target="_blank"
                rel="noreferrer"
                className="w-full py-2.5 px-4 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium flex items-center justify-center gap-2 transition"
              >
                <span>Open Delivered Message in Ethereal Email</span>
                <ExternalLink className="w-4 h-4" />
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
