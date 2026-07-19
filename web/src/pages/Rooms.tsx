import { useEffect, useMemo, useState } from 'react';
import { DoorOpen, PauseCircle, Play, RefreshCw, Upload, CheckSquare, Plus, Sparkles, ExternalLink, ShieldCheck, Gauge, FlaskConical, Zap } from 'lucide-react';
import { api } from '../lib/api';

const ROOMS = [
  { id: 'signal_room', name: 'Room 1 — Signal Discovery', detail: 'Capture broad, source-linked, SME-relevant business signals.' },
  { id: 'selection_enrichment_room', name: 'Room 2 — Selection + Enrichment', detail: 'Manually approve signals before enrichment starts.' },
  { id: 'referrals_room', name: 'Room 3 — Agency Referrals', detail: 'Find agency overflow, white-label and partnership opportunities from free sources.' },
  { id: 'community_monitoring_room', name: 'Room 4 — Community Monitoring', detail: 'Monitor approved X, Reddit, Discord, Slack, Facebook and Google contexts.' },
  { id: 'manual_signal_room', name: 'Room 5 — Manual Signal Intake', detail: 'Enter a credible signal and supporting links manually.' },
];

const LIVE_COLLECTORS = new Set([
  'google_search', 'clutch_basic', 'goodfirms_basic', 'g2_basic',
  'google_community_research', 'reddit_api', 'praw', 'discord_bot', 'slack_app',
]);

// Rooms that run collectors and therefore require an active strategy + Trigger.
const COLLECTOR_ROOMS = new Set(['signal_room', 'referrals_room', 'community_monitoring_room']);

export default function Rooms() {
  const [state, setState] = useState<any>(null);
  const [sources, setSources] = useState<any[]>([]);
  const [selectedSources, setSelectedSources] = useState<string[]>([]);
  const [strategies, setStrategies] = useState<any[]>([]);
  const [strategyId, setStrategyId] = useState('');
  const [sourceConfigs, setSourceConfigs] = useState('{}');
  const [importSource, setImportSource] = useState('');
  const [importItems, setImportItems] = useState('[\n  {"title":"Example signal","text":"Need an automation partner","url":"https://example.com/source"}\n]');
  const [lastRun, setLastRun] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Selection room state
  const [inbox, setInbox] = useState<any[]>([]);
  const [inboxCounts, setInboxCounts] = useState<any[]>([]);
  const [picked, setPicked] = useState<Set<number>>(new Set());

  // Safety controls
  const [mode, setMode] = useState<'test' | 'live'>('test');
  const [validation, setValidation] = useState<any | null>(null);
  const [preflight, setPreflight] = useState<any | null>(null);

  // New-strategy form
  const [showStrategyForm, setShowStrategyForm] = useState(false);
  const [form, setForm] = useState({ name: '', product: '', pains: '', signals: '', industries: '', countries: 'US', targetTitles: '', employeeMin: '10', employeeMax: '200' });

  const activeRoom: string = state?.activeRoom ?? 'idle';
  const isCollectorRoom = COLLECTOR_ROOMS.has(activeRoom);
  const isFreeSourceRoom = activeRoom === 'referrals_room' || activeRoom === 'community_monitoring_room';
  const isSelectionRoom = activeRoom === 'selection_enrichment_room';

  const loadStrategies = async () => {
    const r = await api.get('/strategies');
    setStrategies(r.strategies || []);
    setStrategyId((cur) => cur || r.active?.id || r.strategies?.[0]?.id || '');
  };

  const loadInbox = async () => {
    const r = await api.get('/rooms/signals/inbox');
    setInbox(r.signals || []);
    setInboxCounts(r.counts || []);
  };

  const load = async () => {
    const next = await api.get('/rooms/state');
    setState(next);
    if (next.activeRoom === 'referrals_room' || next.activeRoom === 'community_monitoring_room') {
      const result = await api.get(`/rooms/sources?room=${next.activeRoom}`);
      setSources(result.sources || []);
      setSelectedSources((current) => current.length ? current.filter((id) => result.sources.some((s: any) => s.id === id)) : result.sources.filter((s: any) => LIVE_COLLECTORS.has(s.id)).map((s: any) => s.id));
      setImportSource((current) => current && result.sources.some((s: any) => s.id === current) ? current : result.sources.find((s: any) => !LIVE_COLLECTORS.has(s.id))?.id || '');
    } else {
      setSources([]);
      setSelectedSources([]);
    }
    if (next.activeRoom === 'selection_enrichment_room') await loadInbox().catch(() => {});
    else { setInbox([]); setPicked(new Set()); }
  };

  useEffect(() => { loadStrategies().catch((e) => setError(e.message)); load().catch((e) => setError(e.message)); }, []);

  const importableSources = useMemo(() => sources.filter((s) => !LIVE_COLLECTORS.has(s.id)), [sources]);

  const run = async (fn: () => Promise<any>) => {
    setBusy(true); setError('');
    try { return await fn(); }
    catch (e: any) { setError(e.message); }
    finally { setBusy(false); }
  };

  const activate = (room: string) => run(async () => { setLastRun(null); await api.post('/rooms/activate', { room, actor: 'admin' }); await load(); });
  const idle = () => run(async () => { await api.post('/rooms/idle', { actor: 'admin' }); await load(); });

  const createStrategy = () => run(async () => {
    const r = await api.post('/strategies', {
      name: form.name, product: form.product,
      pains: form.pains.split(',').map((s) => s.trim()).filter(Boolean),
      signals: form.signals.split(',').map((s) => s.trim()).filter(Boolean),
      industries: form.industries.split(',').map((s) => s.trim()).filter(Boolean),
      countries: form.countries.split(',').map((s) => s.trim()).filter(Boolean),
      targetTitles: form.targetTitles.split(',').map((s) => s.trim()).filter(Boolean),
      employeeMin: Number(form.employeeMin), employeeMax: Number(form.employeeMax),
    });
    await loadStrategies();
    setStrategyId(r.strategy.id);
    setShowStrategyForm(false);
    setForm({ name: '', product: '', pains: '', signals: '', industries: '', countries: 'US', targetTitles: '', employeeMin: '10', employeeMax: '200' });
  });

  const activateStrategy = (id: string) => run(async () => { await api.post(`/strategies/${id}/activate`); await loadStrategies(); setStrategyId(id); });

  const trigger = () => run(async () => {
    setLastRun(null);
    let parsedConfigs = {};
    try { parsedConfigs = JSON.parse(sourceConfigs || '{}'); } catch { throw new Error('Source configuration must be valid JSON.'); }
    const result = await api.post(`/rooms/${activeRoom}/run`, { actor: 'admin', strategyId, sourceIds: selectedSources, sourceConfigs: parsedConfigs, mode });
    setLastRun(result);
    await loadInbox().catch(() => {});
  });

  const runPreflight = () => run(async () => {
    setPreflight(null);
    setPreflight(await api.get(`/rooms/${activeRoom}/preflight`));
  });

  const validateCredentials = () => run(async () => {
    setValidation(await api.post('/credentials/validate', {}));
  });

  const importEvidence = () => run(async () => {
    if (!importSource) return;
    const items = JSON.parse(importItems);
    if (!Array.isArray(items)) throw new Error('Import JSON must be an array.');
    setLastRun(await api.post(`/rooms/imports/${importSource}`, { room: activeRoom, strategyId, items }));
  });

  const toggleSource = (id: string) => setSelectedSources((c) => c.includes(id) ? c.filter((x) => x !== id) : [...c, id]);
  const togglePick = (id: number) => setPicked((c) => { const n = new Set(c); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const selectPicked = () => run(async () => {
    await api.post('/rooms/signals/select', { signalIds: [...picked] });
    setPicked(new Set());
    await loadInbox();
  });
  const enrichSelected = () => run(async () => {
    const r = await api.post('/rooms/signals/enrich', { mode });
    setLastRun(r);
    await loadInbox();
  });

  const strategyRequiredMissing = isCollectorRoom && !strategyId;

  return (
    <div className="p-8 space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Room Control</h1>
          <p className="text-sm text-slate-400 mt-1">Exactly one manually triggered room may operate at a time.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Test/Live safety toggle — Test never spends API credits. */}
          <div className="inline-flex rounded-lg border border-slate-700 overflow-hidden">
            <button onClick={() => setMode('test')} className={`px-3 py-2 text-sm flex items-center gap-1.5 ${mode === 'test' ? 'bg-emerald-500/20 text-emerald-200' : 'text-slate-400 hover:text-slate-200'}`}>
              <FlaskConical className="w-4 h-4" /> Test
            </button>
            <button onClick={() => setMode('live')} className={`px-3 py-2 text-sm flex items-center gap-1.5 ${mode === 'live' ? 'bg-gold-500/20 text-gold-200' : 'text-slate-400 hover:text-slate-200'}`}>
              <Zap className="w-4 h-4" /> Live
            </button>
          </div>
          <button className="btn-secondary" onClick={validateCredentials} disabled={busy}><ShieldCheck className="w-4 h-4" /> Validate keys</button>
          <button className="btn-secondary" onClick={() => load()} disabled={busy}><RefreshCw className="w-4 h-4" /> Refresh</button>
          <button className="btn-secondary" onClick={idle} disabled={busy}><PauseCircle className="w-4 h-4" /> Silence All</button>
          {(isCollectorRoom || isSelectionRoom) && (
            <button className="btn-secondary" onClick={runPreflight} disabled={busy}><Gauge className="w-4 h-4" /> Preflight</button>
          )}
          {isCollectorRoom && (
            <button className="btn-gold" onClick={trigger} disabled={busy || strategyRequiredMissing}><Play className="w-4 h-4" /> Trigger ({mode})</button>
          )}
        </div>
      </header>

      {mode === 'test' && (
        <div className="card p-3 border-emerald-500/30 bg-emerald-500/5 text-emerald-200 text-sm flex items-center gap-2">
          <FlaskConical className="w-4 h-4 shrink-0" /> Test mode — synthetic data only, no external calls, <span className="font-semibold">zero API credits spent</span>. Switch to Live once your keys are validated.
        </div>
      )}

      {validation && (
        <section className="card p-5 space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-white">Credential validation <span className="text-xs text-slate-500">({validation.mode} mode)</span></h2>
            <button className="text-slate-500 hover:text-slate-300 text-sm" onClick={() => setValidation(null)}>dismiss</button>
          </div>
          {!validation.results?.length && <p className="text-sm text-slate-400">No connected providers with a cheap validation path.</p>}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {validation.results?.map((r: any) => (
              <div key={r.platformId} className="flex items-center justify-between rounded-lg bg-slate-900/60 border border-slate-700/50 px-3 py-2 text-sm">
                <span className="text-slate-200">{r.platformId} <span className="text-xs text-slate-500">×{r.connectedAccounts}</span></span>
                <span className={
                  r.status === 'ok' ? 'text-emerald-300' : r.status === 'failed' ? 'text-red-300' : 'text-slate-400'
                }>{r.status}{r.quotaRemaining != null ? ` · ${r.quotaRemaining} left` : ''}</span>
              </div>
            ))}
          </div>
          <p className="text-xs text-slate-500">Validation uses each provider's free account/quota endpoint — it never spends enrichment credits, and results are cached.</p>
        </section>
      )}

      {preflight && (
        <section className="card p-5 space-y-2 border-gold-500/30">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-white">Preflight — {preflight.action} in {preflight.room}</h2>
            <button className="text-slate-500 hover:text-slate-300 text-sm" onClick={() => setPreflight(null)}>dismiss</button>
          </div>
          <div className="flex flex-wrap gap-4 text-sm">
            <span className="text-slate-300">Est. live calls: <span className="text-gold-300 font-semibold">{preflight.estimatedLiveCalls}</span></span>
            {preflight.selectedSignals != null && <span className="text-slate-300">Selected signals: <span className="text-white font-semibold">{preflight.selectedSignals}</span></span>}
            <span className="text-slate-400">Budget cap: {preflight.limits?.maxExternalCalls} calls / ${preflight.limits?.maxCostUsd}</span>
          </div>
          {preflight.missingCredentials?.length > 0 && (
            <div className="text-sm text-amber-300">Missing credentials: {preflight.missingCredentials.join(', ')}</div>
          )}
          <p className="text-xs text-slate-500">{preflight.note}</p>
        </section>
      )}

      {error && <div className="card p-4 border-red-500/30 text-red-300">{error}</div>}

      <div className="card p-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-wide text-slate-500">Active room</div>
          <div className="text-lg font-semibold text-white mt-1">{activeRoom === 'idle' ? 'All rooms silent' : state?.labels?.[activeRoom] || 'Loading…'}</div>
          {state?.triggeredAt && <div className="text-xs text-slate-400 mt-1">Triggered {new Date(state.triggeredAt).toLocaleString()}</div>}
        </div>
        <span className={`px-3 py-1 rounded-full text-xs ${activeRoom === 'idle' ? 'bg-slate-700 text-slate-300' : 'bg-emerald-500/15 text-emerald-300'}`}>
          {activeRoom === 'idle' ? 'IDLE' : 'EXCLUSIVE LOCK ACTIVE'}
        </span>
      </div>

      {/* Strategy management — the mandatory targeting context for every collector run + enrichment */}
      <section className="card p-5 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-white">Strategy</h2>
            <p className="text-sm text-slate-400">Targeting context for discovery + enrichment. One strategy is active at a time.</p>
          </div>
          <button className="btn-secondary" onClick={() => setShowStrategyForm((s) => !s)}><Plus className="w-4 h-4" /> New strategy</button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select className="rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-sm min-w-64" value={strategyId} onChange={(e) => setStrategyId(e.target.value)}>
            <option value="">— select a strategy —</option>
            {strategies.map((s) => <option key={s.id} value={s.id}>{s.name} {s.status === 'active' ? '(active)' : ''}</option>)}
          </select>
          {strategyId && strategies.find((s) => s.id === strategyId)?.status !== 'active' && (
            <button className="btn-secondary" onClick={() => activateStrategy(strategyId)} disabled={busy}>Set active</button>
          )}
          {!strategies.length && <span className="text-sm text-amber-300">No strategies yet — create one to enable discovery.</span>}
        </div>

        {showStrategyForm && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 border-t border-slate-700/60">
            <Field label="Name *" value={form.name} onChange={(v) => setForm({ ...form, name: v })} placeholder="SME Automation Buyers" />
            <Field label="Product" value={form.product} onChange={(v) => setForm({ ...form, product: v })} placeholder="agentic automation / SaaS" />
            <Field label="Pains (comma-separated)" value={form.pains} onChange={(v) => setForm({ ...form, pains: v })} placeholder="manual invoicing, scaling pain" />
            <Field label="Signals (comma-separated)" value={form.signals} onChange={(v) => setForm({ ...form, signals: v })} placeholder="hiring, funding" />
            <Field label="Industries * (comma-separated)" value={form.industries} onChange={(v) => setForm({ ...form, industries: v })} placeholder="Logistics, SaaS" />
            <Field label="Countries" value={form.countries} onChange={(v) => setForm({ ...form, countries: v })} placeholder="US, UK" />
            <Field label="Target titles" value={form.targetTitles} onChange={(v) => setForm({ ...form, targetTitles: v })} placeholder="CFO, Head of Ops" />
            <div className="grid grid-cols-2 gap-2">
              <Field label="Employee min" value={form.employeeMin} onChange={(v) => setForm({ ...form, employeeMin: v })} />
              <Field label="Employee max" value={form.employeeMax} onChange={(v) => setForm({ ...form, employeeMax: v })} />
            </div>
            <div className="md:col-span-2">
              <button className="btn-gold" onClick={createStrategy} disabled={busy || !form.name || !form.industries}>Create strategy</button>
            </div>
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {ROOMS.map((room) => {
          const active = activeRoom === room.id;
          return (
            <div key={room.id} className={`card p-5 ${active ? 'border-gold-500/50' : ''}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2"><DoorOpen className="w-5 h-5 text-gold-400" /><h2 className="font-semibold text-white">{room.name}</h2></div>
                  <p className="text-sm text-slate-400 mt-2">{room.detail}</p>
                </div>
                {active && <span className="text-xs text-gold-300">ACTIVE</span>}
              </div>
              <button className={active ? 'btn-secondary mt-4' : 'btn-gold mt-4'} onClick={() => activate(room.id)} disabled={busy || active}>
                {active ? 'Currently active' : 'Activate this room'}
              </button>
            </div>
          );
        })}
      </div>

      {isCollectorRoom && (
        <section className="card p-5 space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-white">Collector Run Configuration</h2>
            <p className="text-sm text-slate-400">{activeRoom === 'signal_room' ? 'Room 1 runs strategy-driven web discovery.' : 'A saved strategy is mandatory. Tokens are used in-memory and are not persisted by this screen.'}</p>
          </div>
          {strategyRequiredMissing && <div className="text-sm text-amber-300">Select or create a strategy above to enable Trigger.</div>}
          {isFreeSourceRoom && (
            <label className="block text-sm text-slate-300">Optional source configurations (JSON)
              <textarea className="mt-1 w-full min-h-32 rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 font-mono text-xs" value={sourceConfigs} onChange={(e) => setSourceConfigs(e.target.value)} placeholder='{"reddit_api":{"subreddits":["agency"]},"discord_bot":{"channelIds":["..."]}}' />
            </label>
          )}
        </section>
      )}

      {sources.length > 0 && (
        <section className="space-y-3">
          <div>
            <h2 className="text-lg font-semibold text-white">Free / Free-tier Sources</h2>
            <p className="text-sm text-slate-400">Select live collectors for the next run. Manual sources use the evidence import panel.</p>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {sources.map((source) => {
              const live = LIVE_COLLECTORS.has(source.id);
              const selected = selectedSources.includes(source.id);
              return (
                <div key={source.id} className={`card p-4 ${selected ? 'border-emerald-500/40' : ''}`}>
                  <div className="flex justify-between gap-3">
                    <div className="font-medium text-white">{source.name}</div>
                    <span className="text-xs text-emerald-300 uppercase">{source.cost.replace('_', ' ')}</span>
                  </div>
                  <p className="text-sm text-slate-300 mt-2">{source.purpose}</p>
                  <div className="text-xs text-slate-500 mt-3">{source.accessModel.replace(/_/g, ' ')} · {live ? 'live collector' : 'import/webhook collector'}</div>
                  <div className="text-xs text-slate-400 mt-1">{source.notes}</div>
                  {live && <button className="btn-secondary mt-3" onClick={() => toggleSource(source.id)}><CheckSquare className="w-4 h-4" /> {selected ? 'Selected' : 'Select for run'}</button>}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {isFreeSourceRoom && importableSources.length > 0 && (
        <section className="card p-5 space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-white">Import Manual / Alert Evidence</h2>
            <p className="text-sm text-slate-400">For X, Facebook Groups, LinkedIn, Upwork, Google Alerts, F5Bot and n8n. Every item requires a credible source URL.</p>
          </div>
          <label className="block text-sm text-slate-300">Source
            <select className="mt-1 w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2" value={importSource} onChange={(e) => setImportSource(e.target.value)}>
              {importableSources.map((source) => <option key={source.id} value={source.id}>{source.name}</option>)}
            </select>
          </label>
          <label className="block text-sm text-slate-300">Evidence items (JSON array)
            <textarea className="mt-1 w-full min-h-40 rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 font-mono text-xs" value={importItems} onChange={(e) => setImportItems(e.target.value)} />
          </label>
          <button className="btn-gold" disabled={busy || !strategyId || !importSource} onClick={importEvidence}><Upload className="w-4 h-4" /> Import Evidence</button>
        </section>
      )}

      {/* Room 2 — Selection + Enrichment */}
      {isSelectionRoom && (
        <section className="card p-5 space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h2 className="text-lg font-semibold text-white">Signal Inbox</h2>
              <p className="text-sm text-slate-400">Select candidate signals, then enrich only the approved ones. Enrichment is never automatic.</p>
            </div>
            <div className="flex gap-2">
              <button className="btn-secondary" onClick={selectPicked} disabled={busy || !picked.size}><CheckSquare className="w-4 h-4" /> Select ({picked.size})</button>
              <button className="btn-gold" onClick={enrichSelected} disabled={busy}><Sparkles className="w-4 h-4" /> Enrich selected ({mode})</button>
            </div>
          </div>
          <div className="flex flex-wrap gap-3 text-xs text-slate-400">
            {inboxCounts.map((c: any) => <span key={c.status}>{c.status}: <span className="text-slate-200 font-semibold">{c.n}</span></span>)}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-500 border-b border-slate-700">
                  <th className="py-2 pr-3"></th>
                  <th className="py-2 pr-3">Signal</th>
                  <th className="py-2 pr-3">Company</th>
                  <th className="py-2 pr-3">Relevance</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3">Source</th>
                </tr>
              </thead>
              <tbody>
                {inbox.map((s) => {
                  const selectable = s.status === 'candidate' || s.status === 'reviewed';
                  return (
                    <tr key={s.id} className="border-b border-slate-800/70">
                      <td className="py-2 pr-3">{selectable && <input type="checkbox" checked={picked.has(s.id)} onChange={() => togglePick(s.id)} />}</td>
                      <td className="py-2 pr-3 max-w-sm"><div className="text-slate-200">{s.title}</div><div className="text-xs text-slate-500 truncate">{s.raw_text}</div></td>
                      <td className="py-2 pr-3 text-slate-300">{s.company_name_raw || '—'}</td>
                      <td className="py-2 pr-3 text-slate-400">{Math.round(s.relevance ?? 0)}</td>
                      <td className="py-2 pr-3"><StatusPill status={s.status} /></td>
                      <td className="py-2 pr-3">{s.source_url ? <a className="text-emerald-300 inline-flex items-center gap-1" href={s.source_url} target="_blank" rel="noreferrer">link <ExternalLink className="w-3 h-3" /></a> : '—'}</td>
                    </tr>
                  );
                })}
                {!inbox.length && <tr><td colSpan={6} className="py-6 text-center text-slate-500">Inbox empty. Discover signals in Rooms 1/3/4 or add one in Room 5.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {lastRun && (
        <section className="card p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-white">Last operation
              {lastRun.mode && <span className={`ml-2 text-xs px-2 py-0.5 rounded-full ${lastRun.mode === 'test' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-gold-500/15 text-gold-300'}`}>{lastRun.mode}</span>}
            </h2>
            <button className="text-slate-500 hover:text-slate-300 text-sm" onClick={() => setLastRun(null)}>dismiss</button>
          </div>
          {lastRun.note && <div className="text-sm text-amber-300">{lastRun.note}</div>}
          {lastRun.runStats && (
            <div className="flex flex-wrap gap-4 text-sm">
              <Stat label="Real calls" value={lastRun.runStats.realCalls} tone={lastRun.runStats.realCalls ? 'gold' : 'emerald'} />
              <Stat label="Synthetic" value={lastRun.runStats.synthesized} />
              <Stat label="Cache hits" value={lastRun.runStats.cacheHits} />
              <Stat label="Skipped (budget)" value={lastRun.runStats.skippedByBudget} tone={lastRun.runStats.skippedByBudget ? 'amber' : undefined} />
              <Stat label="Failures" value={lastRun.runStats.failures} tone={lastRun.runStats.failures ? 'red' : undefined} />
              {typeof lastRun.enriched === 'number' && <Stat label="Leads" value={lastRun.opportunities ?? lastRun.enriched} tone="gold" />}
              {typeof lastRun.inserted === 'number' && <Stat label="Signals in" value={lastRun.inserted} />}
            </div>
          )}
          <details className="text-xs text-slate-400">
            <summary className="cursor-pointer">raw response</summary>
            <pre className="mt-2 overflow-auto whitespace-pre-wrap text-slate-300">{JSON.stringify(lastRun, null, 2)}</pre>
          </details>
        </section>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'emerald' | 'gold' | 'amber' | 'red' }) {
  const color = tone === 'emerald' ? 'text-emerald-300' : tone === 'gold' ? 'text-gold-300' : tone === 'amber' ? 'text-amber-300' : tone === 'red' ? 'text-red-300' : 'text-white';
  return (
    <div className="rounded-lg bg-slate-900/60 border border-slate-700/50 px-3 py-1.5">
      <span className={`font-semibold ${color}`}>{value}</span> <span className="text-xs text-slate-500">{label}</span>
    </div>
  );
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label className="block text-sm text-slate-300">{label}
      <input className="mt-1 w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </label>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    candidate: 'bg-slate-700 text-slate-200',
    reviewed: 'bg-sky-500/15 text-sky-300',
    selected_for_enrichment: 'bg-gold-500/15 text-gold-300',
    enriched: 'bg-emerald-500/15 text-emerald-300',
    rejected: 'bg-red-500/15 text-red-300',
  };
  return <span className={`px-2 py-0.5 rounded-full text-xs ${map[status] ?? 'bg-slate-700 text-slate-300'}`}>{status.replace(/_/g, ' ')}</span>;
}
