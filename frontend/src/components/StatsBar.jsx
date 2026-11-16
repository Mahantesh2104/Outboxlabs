import React from 'react';
import { Clock, CheckCircle2, Loader2, AlertTriangle } from 'lucide-react';

export default function StatsBar({ stats, queueCounts }) {
  const cards = [
    {
      label: 'Scheduled (Pending)',
      value: stats?.pending ?? 0,
      subtext: `${queueCounts?.delayed ?? 0} delayed in Redis`,
      icon: Clock,
      color: 'text-amber-400',
      bg: 'bg-amber-500/10 border-amber-500/20',
    },
    {
      label: 'Processing Now',
      value: stats?.processing ?? 0,
      subtext: `${queueCounts?.active ?? 0} active worker jobs`,
      icon: Loader2,
      color: 'text-indigo-400',
      bg: 'bg-indigo-500/10 border-indigo-500/20',
    },
    {
      label: 'Sent Successfully',
      value: stats?.sent ?? 0,
      subtext: 'Delivered via Ethereal SMTP',
      icon: CheckCircle2,
      color: 'text-emerald-400',
      bg: 'bg-emerald-500/10 border-emerald-500/20',
    },
    {
      label: 'Failed / Cancelled',
      value: (stats?.failed ?? 0) + (stats?.cancelled ?? 0),
      subtext: `${stats?.failed ?? 0} failed, ${stats?.cancelled ?? 0} cancelled`,
      icon: AlertTriangle,
      color: 'text-rose-400',
      bg: 'bg-rose-500/10 border-rose-500/20',
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <div
            key={card.label}
            className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 flex items-center justify-between"
          >
            <div>
              <p className="text-xs font-medium text-slate-400">{card.label}</p>
              <p className="text-2xl font-bold text-white mt-1">{card.value}</p>
              <p className="text-[11px] text-slate-500 mt-1">{card.subtext}</p>
            </div>
            <div className={`w-11 h-11 rounded-xl border flex items-center justify-center ${card.bg}`}>
              <Icon className={`w-5 h-5 ${card.color}`} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
