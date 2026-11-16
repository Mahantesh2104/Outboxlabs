import React from 'react';
import { Mail, Plus, Layers, LogOut, RefreshCw, Server } from 'lucide-react';

export default function Navbar({
  user,
  ethereal,
  queueConfig,
  onOpenCompose,
  onSimulateBulk,
  onRefresh,
  refreshing,
  bulkLoading,
  onLogout,
}) {
  return (
    <header className="bg-slate-900/90 border-b border-slate-800 sticky top-0 z-20 backdrop-blur">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3.5 flex flex-wrap items-center justify-between gap-4">
        {/* Brand & System Telemetry Pill */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center shadow-md shadow-indigo-600/30">
              <Mail className="w-5 h-5 text-white" />
            </div>
            <div>
              <span className="font-bold text-white text-base tracking-tight">Outbox</span>
              <span className="ml-2 text-[11px] font-medium px-2 py-0.5 rounded-full bg-indigo-950 text-indigo-300 border border-indigo-800/60">
                BullMQ Scheduler
              </span>
            </div>
          </div>

          {queueConfig && (
            <div className="hidden lg:flex items-center gap-2 text-xs text-slate-400 bg-slate-950/90 border border-slate-800 px-3 py-1.5 rounded-lg">
              <Server className="w-3.5 h-3.5 text-emerald-400" />
              <span>
                Concurrency: <strong className="text-slate-200">{queueConfig.workerConcurrency}</strong>
              </span>
              <span className="text-slate-700">|</span>
              <span>
                Rate Limit:{' '}
                <strong className="text-slate-200">
                  {queueConfig.rateLimitMax} / {Math.round(queueConfig.rateLimitWindowMs / 1000)}s
                </strong>
              </span>
              {ethereal?.user && (
                <>
                  <span className="text-slate-700">|</span>
                  <span title="Active Ethereal SMTP Account">
                    SMTP: <strong className="text-indigo-300 font-mono">{ethereal.user}</strong>
                  </span>
                </>
              )}
            </div>
          )}
        </div>

        {/* Actions & User Controls */}
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={onRefresh}
            title="Refresh emails and queue state"
            className="p-2 rounded-lg bg-slate-800/80 hover:bg-slate-800 text-slate-300 border border-slate-700/70 transition"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin text-indigo-400' : ''}`} />
          </button>

          <button
            type="button"
            onClick={onSimulateBulk}
            disabled={bulkLoading}
            title="Queue 12 emails at once to test BullMQ concurrency and rate limiting"
            className="px-3 py-2 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-medium flex items-center gap-1.5 transition disabled:opacity-50"
          >
            <Layers className="w-3.5 h-3.5" />
            <span>{bulkLoading ? 'Queueing Batch...' : 'Simulate Bulk Load (12)'}</span>
          </button>

          <button
            type="button"
            onClick={onOpenCompose}
            className="px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs sm:text-sm font-medium flex items-center gap-1.5 shadow-lg shadow-indigo-600/25 transition"
          >
            <Plus className="w-4 h-4" />
            <span>Compose & Schedule</span>
          </button>

          <div className="h-6 w-px bg-slate-800 mx-1 hidden sm:block" />

          <div className="flex items-center gap-2">
            <div className="hidden sm:block text-right">
              <p className="text-xs font-medium text-slate-200 leading-none">{user?.name}</p>
              <p className="text-[11px] text-slate-500 mt-0.5">{user?.email}</p>
            </div>
            <button
              type="button"
              onClick={onLogout}
              title="Sign Out"
              className="p-2 rounded-lg bg-slate-800/70 hover:bg-rose-950/60 hover:text-rose-300 text-slate-400 border border-slate-800 transition"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
