// Shared presentational primitives used across pages.
import { ReactNode } from 'react';

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`card p-5 ${className}`}>{children}</div>;
}

export function Stat({
  label,
  value,
  sub,
  accent = 'text-white',
  icon,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  accent?: string;
  icon?: ReactNode;
}) {
  return (
    <Card className="relative overflow-hidden">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs uppercase tracking-wider text-slate-400">{label}</div>
          <div className={`stat-num mt-2 ${accent}`}>{value}</div>
          {sub && <div className="text-xs text-slate-400 mt-1">{sub}</div>}
        </div>
        {icon && <div className="text-gold-500/70">{icon}</div>}
      </div>
    </Card>
  );
}

const SCORE = (n: number) =>
  n >= 80 ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30'
  : n >= 60 ? 'text-gold-400 bg-gold-500/10 border-gold-500/30'
  : n >= 40 ? 'text-amber-300 bg-amber-500/10 border-amber-500/30'
  : 'text-slate-400 bg-ink-800 border-ink-600';

export function ScoreBadge({ score }: { score: number }) {
  return (
    <span className={`pill border font-mono font-semibold ${SCORE(score)}`}>{score}</span>
  );
}

export function ProductTag({ product }: { product: string }) {
  const map: Record<string, string> = {
    GEO: 'text-sky-300 bg-sky-500/10 border-sky-500/30',
    AR: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30',
    BOTH: 'text-purple-300 bg-purple-500/10 border-purple-500/30',
  };
  return <span className={`pill border ${map[product] ?? map.BOTH}`}>{product}</span>;
}

export function StatusDot({ status }: { status: string }) {
  const map: Record<string, string> = {
    connected: 'bg-emerald-400',
    active: 'bg-emerald-400',
    error: 'bg-rose-400',
    disconnected: 'bg-slate-500',
    reserved: 'bg-gold-500',
    pending: 'bg-amber-400',
  };
  return <span className={`inline-block w-2 h-2 rounded-full ${map[status] ?? 'bg-slate-500'}`} />;
}

export function Bar({ value, max, className = 'bg-gold-500' }: { value: number; max: number; className?: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="h-2 w-full bg-ink-800 rounded-full overflow-hidden">
      <div className={`h-full ${className}`} style={{ width: `${pct}%` }} />
    </div>
  );
}
