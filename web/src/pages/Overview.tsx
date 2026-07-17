import { useEffect, useState } from 'react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell,
  PieChart, Pie, RadialBarChart, RadialBar,
} from 'recharts';
import { Target, Users, Plug, Activity, Sparkles, TrendingUp } from 'lucide-react';
import { api } from '../lib/api';
import { Card, Stat, Bar as MiniBar } from '../components/ui';

const GOLD = '#e0a83c';
const EMERALD = '#34d399';
const SKY = '#38bdf8';
const PURPLE = '#a78bfa';

export default function Overview() {
  const [d, setD] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  const load = () => api.get('/dashboard').then(setD);
  useEffect(() => { load(); }, []);

  const runBatch = async () => {
    setBusy(true);
    await api.post('/enrich-batch', { limit: 30 });
    await load();
    setBusy(false);
  };

  if (!d) return <div className="p-8 text-slate-400">Loading the forge…</div>;

  const buckets = ['1-39', '40-59', '60-79', '80-100'].map((b) => ({
    bucket: b,
    n: d.scoreBuckets.find((x: any) => x.bucket === b)?.n ?? 0,
  }));
  const bucketColor = ['#64748b', '#fbbf24', GOLD, EMERALD];
  const split = d.productSplit.map((p: any) => ({
    name: p.product, value: p.n,
    fill: p.product === 'GEO' ? SKY : p.product === 'AR' ? EMERALD : PURPLE,
  }));
  const runOk = d.runs.total ? Math.round((d.runs.ok / d.runs.total) * 100) : 0;

  return (
    <div className="p-8 space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Command Center</h1>
          <p className="text-slate-400 text-sm mt-1">
            Autonomous signal enrichment across a 30-owner account pool.
          </p>
        </div>
        <button className="btn-gold" onClick={runBatch} disabled={busy}>
          <Sparkles className="w-4 h-4" />
          {busy ? 'Enriching…' : 'Run Enrichment Batch'}
        </button>
      </header>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat label="Qualified Leads" value={d.leadStats.qualified ?? 0}
          sub={`of ${d.leadStats.total} sourced · avg score ${d.leadStats.avg_score ?? 0}`}
          accent="text-emerald-400" icon={<Target className="w-6 h-6" />} />
        <Stat label="Live Owners" value={`${d.owners.active}/${d.owners.total}`}
          sub={`${d.owners.reserved} reserved, ready to activate`} icon={<Users className="w-6 h-6" />} />
        <Stat label="Connected Accounts" value={d.accounts.connected}
          sub={`across ${d.accounts.total} in the pool`} accent="text-gold-400" icon={<Plug className="w-6 h-6" />} />
        <Stat label="Provider Calls" value={d.runs.total}
          sub={`${runOk}% success · auto-failover on limit`} icon={<Activity className="w-6 h-6" />} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-white">Lead Fit-Score Distribution</h2>
            <span className="text-xs text-slate-400">work leads scoring 60+</span>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={buckets}>
              <XAxis dataKey="bucket" tick={{ fill: '#94a3b8', fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#94a3b8', fontSize: 12 }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip contentStyle={{ background: '#14141d', border: '1px solid #33333f', borderRadius: 12 }} />
              <Bar dataKey="n" radius={[8, 8, 0, 0]}>
                {buckets.map((_, i) => <Cell key={i} fill={bucketColor[i]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card>
          <h2 className="font-semibold text-white mb-2">GEO vs AR Routing</h2>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={split} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={3}>
                {split.map((s: any, i: number) => <Cell key={i} fill={s.fill} />)}
              </Pie>
              <Tooltip contentStyle={{ background: '#14141d', border: '1px solid #33333f', borderRadius: 12 }} />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex justify-center gap-4 text-xs">
            {split.map((s: any) => (
              <span key={s.name} className="flex items-center gap-1.5 text-slate-300">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: s.fill }} /> {s.name} ({s.value})
              </span>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card>
          <h2 className="font-semibold text-white mb-4 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-gold-400" /> Top Firing Signals
          </h2>
          <div className="space-y-3">
            {d.topSignals.map((s: any) => (
              <div key={s.signal_code} className="flex items-center gap-3">
                <span className="font-mono text-xs text-gold-400 w-10">{s.signal_code}</span>
                <MiniBar value={s.n} max={d.topSignals[0].n} />
                <span className="text-xs text-slate-400 w-6 text-right">{s.n}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <h2 className="font-semibold text-white mb-4">Owner Contribution</h2>
          <p className="text-[11px] text-slate-400 mb-3 -mt-2">Provider calls served per owner account — the basis for revenue share.</p>
          <div className="space-y-2.5">
            {d.contribution.slice(0, 7).map((c: any) => (
              <div key={c.owner_name} className="flex items-center gap-3">
                <span className="text-xs text-slate-300 w-28 truncate">{c.owner_name}</span>
                <MiniBar value={c.calls} max={d.contribution[0].calls} className="bg-emerald-500" />
                <span className="text-xs text-slate-400 w-8 text-right">{c.calls}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <h2 className="font-semibold text-white mb-2">Pool Success Rate</h2>
          <div className="relative">
            <ResponsiveContainer width="100%" height={200}>
              <RadialBarChart innerRadius="72%" outerRadius="100%" data={[{ v: runOk, fill: GOLD }]} startAngle={90} endAngle={-270}>
                <RadialBar dataKey="v" cornerRadius={20} background={{ fill: '#242430' }} />
              </RadialBarChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <div className="text-4xl font-bold text-white leading-none">{runOk}%</div>
              <div className="text-xs text-slate-400 mt-1">calls succeeded</div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
