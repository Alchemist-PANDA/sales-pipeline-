import { useEffect, useState } from 'react';
import { RefreshCw, ExternalLink, ShieldCheck, Mail, Phone, Linkedin, Building2 } from 'lucide-react';
import { api } from '../lib/api';

/**
 * Actionable leads — the output of Room 2 enrichment. Each opportunity joins the
 * originating signal, the resolved company, its decision-makers, verification
 * confidence, and the composite priority score with a recommended next action.
 */
export default function Opportunities() {
  const [opps, setOpps] = useState<any[]>([]);
  const [minScore, setMinScore] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = async (min = minScore) => {
    setBusy(true); setError('');
    try { const r = await api.get(`/rooms/opportunities?minScore=${min}`); setOpps(r.opportunities || []); }
    catch (e: any) { setError(e.message); }
    finally { setBusy(false); }
  };
  useEffect(() => { load(0); }, []);

  return (
    <div className="p-8 space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Actionable Leads</h1>
          <p className="text-sm text-slate-400 mt-1">Enriched opportunities: signal → company → decision-makers → verified contact → recommended action.</p>
        </div>
        <div className="flex items-center gap-2">
          <select className="rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-sm" value={minScore} onChange={(e) => { const v = Number(e.target.value); setMinScore(v); load(v); }}>
            <option value={0}>All scores</option>
            <option value={40}>40+</option>
            <option value={60}>60+ (qualified)</option>
            <option value={80}>80+</option>
          </select>
          <button className="btn-secondary" onClick={() => load()} disabled={busy}><RefreshCw className="w-4 h-4" /> Refresh</button>
        </div>
      </header>

      {error && <div className="card p-4 border-red-500/30 text-red-300">{error}</div>}

      {!opps.length && !busy && (
        <div className="card p-8 text-center text-slate-400">
          No enriched leads yet. Activate <span className="text-gold-300">Room 2</span>, select signals, and run enrichment.
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {opps.map((o) => {
          const lead = o.actionable_lead || {};
          const scores = lead.scores || {};
          const rec = lead.recommendation || {};
          return (
            <div key={o.id} className="card p-5 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-gold-400" />
                    <span className="font-semibold text-white">{o.company_name}</span>
                    {o.company_verification === 'verified' && <ShieldCheck className="w-4 h-4 text-emerald-400" />}
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">{o.company_domain} · {o.industry || 'industry pending'} · {o.employee_count ? `${o.employee_count} emp` : 'size pending'}</div>
                </div>
                <div className="text-right">
                  <div className={`text-2xl font-bold ${o.priority_score >= 60 ? 'text-emerald-300' : 'text-slate-200'}`}>{o.priority_score}</div>
                  <div className="text-[10px] uppercase tracking-wide text-slate-500">{o.status}</div>
                </div>
              </div>

              <div className="rounded-lg bg-slate-900/60 border border-slate-700/60 p-3">
                <div className="text-xs uppercase tracking-wide text-slate-500 mb-1">Signal</div>
                <div className="text-sm text-slate-200">{o.signal_title}</div>
                <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                  <span>{o.signal_platform}</span>
                  {o.signal_url && <a className="text-emerald-300 inline-flex items-center gap-1" href={o.signal_url} target="_blank" rel="noreferrer">source <ExternalLink className="w-3 h-3" /></a>}
                </div>
              </div>

              <div>
                <div className="text-xs uppercase tracking-wide text-slate-500 mb-1">Decision-makers</div>
                {o.people?.length ? o.people.map((p: any) => (
                  <div key={p.id} className="flex flex-wrap items-center gap-3 text-sm text-slate-300 py-1">
                    <span className="font-medium text-white">{p.full_name}</span>
                    <span className="text-slate-500">{p.title}</span>
                    {p.email && <span className="inline-flex items-center gap-1"><Mail className="w-3 h-3 text-slate-500" />{p.email}{p.email_status === 'verified' && <ShieldCheck className="w-3 h-3 text-emerald-400" />}</span>}
                    {p.phone && <span className="inline-flex items-center gap-1"><Phone className="w-3 h-3 text-slate-500" />{p.phone}</span>}
                    {p.linkedin_url && <a className="inline-flex items-center gap-1 text-emerald-300" href={`https://${p.linkedin_url.replace(/^https?:\/\//, '')}`} target="_blank" rel="noreferrer"><Linkedin className="w-3 h-3" />profile</a>}
                  </div>
                )) : <div className="text-sm text-slate-500">No contact resolved.</div>}
              </div>

              <div className="grid grid-cols-5 gap-2 text-center">
                {[['ICP', scores.icp], ['Intent', scores.intent], ['Fresh', scores.freshness], ['Evidence', scores.evidence], ['Contact', scores.contactability]].map(([label, v]) => (
                  <div key={label as string} className="rounded-lg bg-slate-900/60 border border-slate-700/50 py-2">
                    <div className="text-sm font-semibold text-slate-200">{Math.round(((v as number) ?? 0) * 100)}</div>
                    <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
                  </div>
                ))}
              </div>

              {rec.nextAction && (
                <div className="rounded-lg bg-gold-500/10 border border-gold-500/20 p-3">
                  <div className="text-xs uppercase tracking-wide text-gold-300/80 mb-1">Recommended</div>
                  <div className="text-sm text-slate-200">{rec.offer}</div>
                  <div className="text-xs text-slate-400 mt-1">{rec.nextAction}</div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
