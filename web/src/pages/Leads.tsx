import { useEffect, useState } from 'react';
import { Mail, Phone, MapPin, Building2, Sparkles, ChevronDown, ShieldCheck } from 'lucide-react';
import { api, Lead } from '../lib/api';
import { ScoreBadge, ProductTag, Card } from '../components/ui';

export default function Leads() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [minScore, setMinScore] = useState(0);
  const [open, setOpen] = useState<number | null>(null);
  const [busy, setBusy] = useState<number | null>(null);

  const load = (m = minScore) => api.get(`/leads?minScore=${m}`).then((r) => setLeads(r.leads));
  useEffect(() => { load(); }, []);

  const reEnrich = async (id: number) => {
    setBusy(id);
    await api.post(`/enrich/${id}`);
    await load();
    setBusy(null);
  };

  return (
    <div className="p-8 space-y-6">
      <header className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Signal Leads</h1>
          <p className="text-slate-400 text-sm mt-1">Enriched, scored & routed. Work leads at 60+ fit first.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400">min score</span>
          {[0, 40, 60, 80].map((s) => (
            <button
              key={s}
              onClick={() => { setMinScore(s); load(s); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
                minScore === s ? 'bg-gold-500 text-ink-950' : 'bg-ink-800 text-slate-300 hover:bg-ink-700'
              }`}
            >
              {s === 0 ? 'All' : `${s}+`}
            </button>
          ))}
        </div>
      </header>

      <Card className="!p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wider text-slate-400 border-b border-ink-700">
              <th className="px-5 py-3">Company</th>
              <th className="px-5 py-3">Contact</th>
              <th className="px-5 py-3">Industry / Size</th>
              <th className="px-5 py-3">Signals</th>
              <th className="px-5 py-3">Route</th>
              <th className="px-5 py-3">Score</th>
              <th className="px-5 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {leads.map((l) => (
              <>
                <tr key={l.id} className="border-b border-ink-800/70 hover:bg-ink-850/50 transition-colors">
                  <td className="px-5 py-3">
                    <div className="font-semibold text-white">{l.company}</div>
                    <div className="text-xs text-slate-500">{l.domain}</div>
                  </td>
                  <td className="px-5 py-3">
                    {l.email ? (
                      <div className="flex items-center gap-1.5 text-slate-300 text-xs">
                        <Mail className="w-3.5 h-3.5 text-slate-500" /> {l.email}
                        {l.email_status === 'verified' && <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />}
                      </div>
                    ) : <span className="text-slate-600 text-xs">—</span>}
                    {l.phone && <div className="flex items-center gap-1.5 text-slate-400 text-xs mt-0.5"><Phone className="w-3 h-3" /> {l.phone}</div>}
                  </td>
                  <td className="px-5 py-3 text-xs text-slate-400">
                    <div>{l.industry ?? '—'}</div>
                    {l.employee_count ? <div className="text-slate-500">{l.employee_count} employees</div> : null}
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex flex-wrap gap-1 max-w-[180px]">
                      {l.signals.slice(0, 4).map((s, i) => (
                        <span key={i} className="pill bg-ink-800 border border-ink-600 text-gold-400 font-mono text-[10px]">
                          {s.signal_code}
                        </span>
                      ))}
                      {l.signals.length > 4 && <span className="text-[10px] text-slate-500">+{l.signals.length - 4}</span>}
                    </div>
                  </td>
                  <td className="px-5 py-3"><ProductTag product={l.product} /></td>
                  <td className="px-5 py-3"><ScoreBadge score={l.fit_score} /></td>
                  <td className="px-5 py-3">
                    <button className="text-slate-400 hover:text-white" onClick={() => setOpen(open === l.id ? null : l.id)}>
                      <ChevronDown className={`w-4 h-4 transition-transform ${open === l.id ? 'rotate-180' : ''}`} />
                    </button>
                  </td>
                </tr>
                {open === l.id && (
                  <tr className="bg-ink-900/60">
                    <td colSpan={7} className="px-5 py-4">
                      <div className="grid md:grid-cols-2 gap-4">
                        <div>
                          <div className="text-xs uppercase tracking-wider text-slate-400 mb-2">Detected signal evidence</div>
                          <div className="space-y-1.5">
                            {l.signals.map((s, i) => (
                              <div key={i} className="flex items-start gap-2 text-xs">
                                <span className="pill bg-gold-500/10 text-gold-300 border border-gold-500/30 font-mono">{s.signal_code}</span>
                                <span className="text-slate-300">{s.evidence}</span>
                                <span className="text-slate-600 ml-auto shrink-0">via {s.source}</span>
                              </div>
                            ))}
                            {!l.signals.length && <span className="text-slate-500 text-xs">No signals yet.</span>}
                          </div>
                        </div>
                        <div className="flex flex-col gap-2">
                          <div className="text-xs text-slate-400 flex items-center gap-2"><MapPin className="w-3.5 h-3.5" /> {l.location ?? '—'}</div>
                          {l.linkedin && <div className="text-xs text-slate-400 flex items-center gap-2"><Building2 className="w-3.5 h-3.5" /> {l.linkedin}</div>}
                          <button className="btn-gold w-fit mt-2" onClick={() => reEnrich(l.id)} disabled={busy === l.id}>
                            <Sparkles className="w-4 h-4" /> {busy === l.id ? 'Re-enriching…' : 'Re-run enrichment'}
                          </button>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
        {!leads.length && <div className="p-8 text-center text-slate-500 text-sm">No leads at this score. Run an enrichment batch from the Overview.</div>}
      </Card>
    </div>
  );
}
