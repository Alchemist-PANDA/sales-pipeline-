import { useEffect, useMemo, useState } from 'react';
import { DoorOpen, PauseCircle, Play, RefreshCw, Upload, CheckSquare } from 'lucide-react';
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

export default function Rooms() {
  const [state, setState] = useState<any>(null);
  const [sources, setSources] = useState<any[]>([]);
  const [selectedSources, setSelectedSources] = useState<string[]>([]);
  const [strategyId, setStrategyId] = useState('');
  const [sourceConfigs, setSourceConfigs] = useState('{}');
  const [importSource, setImportSource] = useState('');
  const [importItems, setImportItems] = useState('[\n  {"title":"Example signal","text":"Need an automation partner","url":"https://example.com/source"}\n]');
  const [lastRun, setLastRun] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

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
  };

  useEffect(() => { load().catch((e) => setError(e.message)); }, []);

  const activeSignalRoom = state?.activeRoom === 'referrals_room' || state?.activeRoom === 'community_monitoring_room';
  const importableSources = useMemo(() => sources.filter((s) => !LIVE_COLLECTORS.has(s.id)), [sources]);

  const activate = async (room: string) => {
    setBusy(true); setError(''); setLastRun(null);
    try { await api.post('/rooms/activate', { room, actor: 'admin' }); await load(); }
    catch (e: any) { setError(e.message); }
    finally { setBusy(false); }
  };

  const idle = async () => {
    setBusy(true); setError('');
    try { await api.post('/rooms/idle', { actor: 'admin' }); await load(); }
    catch (e: any) { setError(e.message); }
    finally { setBusy(false); }
  };

  const trigger = async () => {
    if (!state?.activeRoom || state.activeRoom === 'idle') return;
    setBusy(true); setError(''); setLastRun(null);
    try {
      let parsedConfigs = {};
      try { parsedConfigs = JSON.parse(sourceConfigs || '{}'); }
      catch { throw new Error('Source configuration must be valid JSON.'); }
      const result = await api.post(`/rooms/${state.activeRoom}/run`, {
        actor: 'admin', strategyId, sourceIds: selectedSources, sourceConfigs: parsedConfigs,
      });
      setLastRun(result);
    } catch (e: any) { setError(e.message); }
    finally { setBusy(false); }
  };

  const importEvidence = async () => {
    if (!importSource) return;
    setBusy(true); setError('');
    try {
      const items = JSON.parse(importItems);
      if (!Array.isArray(items)) throw new Error('Import JSON must be an array.');
      const result = await api.post(`/rooms/imports/${importSource}`, { room: state.activeRoom, strategyId, items });
      setLastRun(result);
    } catch (e: any) { setError(e.message); }
    finally { setBusy(false); }
  };

  const toggleSource = (id: string) => setSelectedSources((current) => current.includes(id) ? current.filter((x) => x !== id) : [...current, id]);

  return (
    <div className="p-8 space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Room Control</h1>
          <p className="text-sm text-slate-400 mt-1">Exactly one manually triggered room may operate at a time.</p>
        </div>
        <div className="flex gap-2">
          <button className="btn-secondary" onClick={() => load()} disabled={busy}><RefreshCw className="w-4 h-4" /> Refresh</button>
          <button className="btn-secondary" onClick={idle} disabled={busy}><PauseCircle className="w-4 h-4" /> Silence All</button>
          <button className="btn-gold" onClick={trigger} disabled={busy || state?.activeRoom === 'idle' || (activeSignalRoom && !strategyId)}><Play className="w-4 h-4" /> Trigger Active Room</button>
        </div>
      </header>

      {error && <div className="card p-4 border-red-500/30 text-red-300">{error}</div>}

      <div className="card p-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-wide text-slate-500">Active room</div>
          <div className="text-lg font-semibold text-white mt-1">{state?.activeRoom === 'idle' ? 'All rooms silent' : state?.labels?.[state?.activeRoom] || 'Loading…'}</div>
          {state?.triggeredAt && <div className="text-xs text-slate-400 mt-1">Triggered {new Date(state.triggeredAt).toLocaleString()}</div>}
        </div>
        <span className={`px-3 py-1 rounded-full text-xs ${state?.activeRoom === 'idle' ? 'bg-slate-700 text-slate-300' : 'bg-emerald-500/15 text-emerald-300'}`}>
          {state?.activeRoom === 'idle' ? 'IDLE' : 'EXCLUSIVE LOCK ACTIVE'}
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {ROOMS.map((room) => {
          const active = state?.activeRoom === room.id;
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

      {activeSignalRoom && (
        <section className="card p-5 space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-white">Collector Run Configuration</h2>
            <p className="text-sm text-slate-400">A saved strategy is mandatory. Tokens are used in-memory and are not persisted by this screen.</p>
          </div>
          <label className="block text-sm text-slate-300">Strategy ID
            <input className="mt-1 w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2" value={strategyId} onChange={(e) => setStrategyId(e.target.value)} placeholder="strategy-uuid" />
          </label>
          <label className="block text-sm text-slate-300">Optional source configurations (JSON)
            <textarea className="mt-1 w-full min-h-32 rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 font-mono text-xs" value={sourceConfigs} onChange={(e) => setSourceConfigs(e.target.value)} placeholder='{"reddit_api":{"subreddits":["agency"]},"discord_bot":{"channelIds":["..."]}}' />
          </label>
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
                  <div className="text-xs text-slate-500 mt-3">{source.accessModel.replaceAll('_', ' ')} · {live ? 'live collector' : 'import/webhook collector'}</div>
                  <div className="text-xs text-slate-400 mt-1">{source.notes}</div>
                  {live && <button className="btn-secondary mt-3" onClick={() => toggleSource(source.id)}><CheckSquare className="w-4 h-4" /> {selected ? 'Selected' : 'Select for run'}</button>}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {activeSignalRoom && importableSources.length > 0 && (
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

      {lastRun && (
        <section className="card p-5">
          <h2 className="font-semibold text-white">Last operation</h2>
          <pre className="mt-3 overflow-auto whitespace-pre-wrap text-xs text-slate-300">{JSON.stringify(lastRun, null, 2)}</pre>
        </section>
      )}
    </div>
  );
}
