import { useEffect, useState } from 'react';
import { DoorOpen, PauseCircle, Play, RefreshCw } from 'lucide-react';
import { api } from '../lib/api';

const ROOMS = [
  { id: 'signal_room', name: 'Room 1 — Signal Discovery', detail: 'Capture broad, source-linked, SME-relevant business signals.' },
  { id: 'selection_enrichment_room', name: 'Room 2 — Selection + Enrichment', detail: 'Manually approve signals before enrichment starts.' },
  { id: 'referrals_room', name: 'Room 3 — Agency Referrals', detail: 'Find agency overflow, white-label and partnership opportunities from free sources.' },
  { id: 'community_monitoring_room', name: 'Room 4 — Community Monitoring', detail: 'Monitor approved X, Reddit, Discord, Slack, Facebook and Google contexts.' },
  { id: 'manual_signal_room', name: 'Room 5 — Manual Signal Intake', detail: 'Enter a credible signal and supporting links manually.' },
];

export default function Rooms() {
  const [state, setState] = useState<any>(null);
  const [sources, setSources] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    const next = await api.get('/rooms/state');
    setState(next);
    if (next.activeRoom === 'referrals_room' || next.activeRoom === 'community_monitoring_room') {
      const result = await api.get(`/rooms/sources?room=${next.activeRoom}`);
      setSources(result.sources || []);
    } else setSources([]);
  };

  useEffect(() => { load().catch((e) => setError(e.message)); }, []);

  const activate = async (room: string) => {
    setBusy(true); setError('');
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
    setBusy(true); setError('');
    try { await api.post(`/rooms/${state.activeRoom}/run`, { actor: 'admin' }); }
    catch (e: any) { setError(e.message); }
    finally { setBusy(false); }
  };

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
          <button className="btn-gold" onClick={trigger} disabled={busy || state?.activeRoom === 'idle'}><Play className="w-4 h-4" /> Trigger Active Room</button>
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

      {sources.length > 0 && (
        <section className="space-y-3">
          <div>
            <h2 className="text-lg font-semibold text-white">Free / Free-tier Sources</h2>
            <p className="text-sm text-slate-400">Partner pools require individually authorized accounts. No credential sharing or quota bypass.</p>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {sources.map((source) => (
              <div key={source.id} className="card p-4">
                <div className="flex justify-between gap-3">
                  <div className="font-medium text-white">{source.name}</div>
                  <span className="text-xs text-emerald-300 uppercase">{source.cost.replace('_', ' ')}</span>
                </div>
                <p className="text-sm text-slate-300 mt-2">{source.purpose}</p>
                <div className="text-xs text-slate-500 mt-3">{source.accessModel.replaceAll('_', ' ')} · maximum configured integrations: {source.maxPartnerAccounts}</div>
                <div className="text-xs text-slate-400 mt-1">{source.notes}</div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
