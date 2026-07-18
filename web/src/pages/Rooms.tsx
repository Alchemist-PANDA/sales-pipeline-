import { useEffect, useState, useCallback } from 'react';
import { Radio, Zap, Hand, PenTool, CheckCircle2, XCircle, ArrowRight, Sparkles, ExternalLink, AlertTriangle } from 'lucide-react';
import { api } from '../lib/api';
import { Card, ScoreBadge } from '../components/ui';

interface SignalEvent {
  id: number;
  signal_code: string;
  title: string;
  company_name: string | null;
  company_domain: string | null;
  source_url: string;
  source_platform: string;
  evidence: string;
  strength: number;
  status: string;
  room_origin: number;
  enrichment_data: string | null;
  created_at: string;
}

interface RoomState {
  activeRoom: number | null;
  state: string;
  activatedAt: string | null;
  activatedBy: string | null;
  signalStats: { total: number; new: number; reviewed: number; selected: number; enriched: number; rejected: number };
}

interface Strategy {
  id: number;
  name: string;
  product: string;
  pains: string[];
  customer_types: string[];
  regions: string[];
  industries: string[];
  active: boolean;
}

const ROOM_META = [
  { id: 1, label: 'Signal Room', desc: 'Crawl platforms, detect signals', icon: Radio, color: 'gold' },
  { id: 2, label: 'Selection Room', desc: 'Review & enrich selected', icon: Hand, color: 'emerald' },
  { id: 3, label: 'Manual Signal', desc: 'Enter signal with evidence', icon: PenTool, color: 'sky' },
] as const;

export default function Rooms() {
  const [roomState, setRoomState] = useState<RoomState | null>(null);
  const [signals, setSignals] = useState<SignalEvent[]>([]);
  const [strategies_, setStrategies] = useState<Strategy[]>([]);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const loadState = useCallback(() => {
    api.get('/rooms/state').then(setRoomState);
    api.get('/strategies').then((r) => setStrategies(r.strategies));
  }, []);

  const loadSignals = useCallback(() => {
    if (!roomState) return;
    const room = roomState.activeRoom;
    if (room === 1) api.get('/rooms/1/signals').then(r => setSignals(r.signals));
    else if (room === 2) api.get('/rooms/2/signals').then(r => setSignals(r.signals));
    else if (room === 3) api.get('/rooms/3/signals').then(r => setSignals(r.signals));
    else setSignals([]);
  }, [roomState]);

  useEffect(() => { loadState(); }, [loadState]);
  useEffect(() => { loadSignals(); }, [roomState?.activeRoom, loadSignals]);

  const activate = async (room: number) => {
    setBusy(true);
    await api.post('/rooms/activate', { room });
    await loadState();
    setBusy(false);
  };

  const deactivate = async () => {
    setBusy(true);
    await api.post('/rooms/deactivate');
    setSignals([]);
    await loadState();
    setBusy(false);
  };

  const runCrawl = async () => {
    setBusy(true);
    await api.post('/rooms/1/run', {});
    loadSignals();
    setBusy(false);
  };

  const reviewSignal = async (id: number) => {
    await api.post(`/rooms/1/${id}/review`);
    loadSignals();
  };

  const rejectSignal = async (id: number) => {
    await api.post(`/rooms/1/${id}/reject`);
    loadSignals();
  };

  const selectForEnrichment = async () => {
    if (!selected.size) return;
    setBusy(true);
    await api.post('/rooms/2/select', { ids: [...selected] });
    setSelected(new Set());
    loadSignals();
    setBusy(false);
  };

  const enrichSelected = async () => {
    setBusy(true);
    await api.post('/rooms/2/enrich');
    loadSignals();
    setBusy(false);
  };

  const activeRoom = roomState?.activeRoom;
  const stats = roomState?.signalStats;

  return (
    <div className="p-8 space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-white">Signal Rooms</h1>
        <p className="text-slate-400 text-sm mt-1">Signal-first pipeline. One room active at a time.</p>
      </header>

      {/* Stats bar */}
      {stats && (
        <div className="flex gap-4 text-xs">
          <span className="text-slate-400">Total: <span className="text-white font-semibold">{stats.total}</span></span>
          <span className="text-gold-400">New: {stats.new}</span>
          <span className="text-sky-400">Reviewed: {stats.reviewed}</span>
          <span className="text-emerald-400">Selected: {stats.selected}</span>
          <span className="text-purple-400">Enriched: {stats.enriched}</span>
          <span className="text-slate-500">Rejected: {stats.rejected}</span>
        </div>
      )}

      {/* Room switcher */}
      <div className="grid grid-cols-3 gap-4">
        {ROOM_META.map((rm) => {
          const isActive = activeRoom === rm.id;
          const colorClasses = {
            gold: isActive ? 'border-gold-500 bg-gold-500/10' : 'border-ink-700 hover:border-gold-500/50',
            emerald: isActive ? 'border-emerald-500 bg-emerald-500/10' : 'border-ink-700 hover:border-emerald-500/50',
            sky: isActive ? 'border-sky-500 bg-sky-500/10' : 'border-ink-700 hover:border-sky-500/50',
          }[rm.color];

          return (
            <button
              key={rm.id}
              onClick={() => isActive ? deactivate() : activate(rm.id)}
              disabled={busy || (!!activeRoom && !isActive)}
              className={`card p-5 border-2 text-left transition-all ${colorClasses} ${!!activeRoom && !isActive ? 'opacity-40 cursor-not-allowed' : ''}`}
            >
              <div className="flex items-center gap-3">
                <rm.icon className={`w-5 h-5 ${isActive ? (rm.color === 'gold' ? 'text-gold-400' : rm.color === 'emerald' ? 'text-emerald-400' : 'text-sky-400') : 'text-slate-500'}`} />
                <div>
                  <div className={`font-semibold ${isActive ? 'text-white' : 'text-slate-300'}`}>Room {rm.id}: {rm.label}</div>
                  <div className="text-xs text-slate-500">{rm.desc}</div>
                </div>
              </div>
              {isActive && (
                <div className="mt-3 text-xs text-slate-400 flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" /> Active — click to deactivate
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Active room content */}
      {activeRoom === 1 && <Room1View signals={signals} strategies={strategies_} busy={busy} onRun={runCrawl} onReview={reviewSignal} onReject={rejectSignal} />}
      {activeRoom === 2 && <Room2View signals={signals} selected={selected} setSelected={setSelected} busy={busy} onSelect={selectForEnrichment} onEnrich={enrichSelected} />}
      {activeRoom === 3 && <Room3View signals={signals} busy={busy} onRefresh={loadSignals} />}
      {!activeRoom && <IdleView stats={stats} />}
    </div>
  );
}

function IdleView({ stats }: { stats?: RoomState['signalStats'] | null }) {
  return (
    <Card className="text-center py-12">
      <AlertTriangle className="w-8 h-8 text-gold-400 mx-auto mb-3" />
      <div className="text-white font-semibold">All rooms idle</div>
      <p className="text-slate-400 text-sm mt-2">Activate a room above to begin. Only one room operates at a time.</p>
      {stats && stats.new > 0 && (
        <p className="text-gold-400 text-sm mt-3">{stats.new} unreviewed signal{stats.new > 1 ? 's' : ''} waiting in the inbox.</p>
      )}
    </Card>
  );
}

function Room1View({ signals, strategies, busy, onRun, onReview, onReject }: {
  signals: SignalEvent[];
  strategies: Strategy[];
  busy: boolean;
  onRun: () => void;
  onReview: (id: number) => void;
  onReject: (id: number) => void;
}) {
  const activeStrategy = strategies.find(s => s.active);

  return (
    <div className="space-y-4">
      <Card className="flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold text-white">Signal Crawl</div>
          <div className="text-xs text-slate-400 mt-0.5">
            Strategy: {activeStrategy ? <span className="text-gold-300">{activeStrategy.name}</span> : <span className="text-rose-400">None — create one first</span>}
          </div>
        </div>
        <button onClick={onRun} disabled={busy || !activeStrategy} className="btn-gold">
          <Zap className="w-4 h-4" /> {busy ? 'Crawling…' : 'Run Signal Crawl'}
        </button>
      </Card>

      <SignalTable signals={signals} actions={(sig) => (
        <div className="flex gap-1">
          {sig.status === 'new' && (
            <>
              <button onClick={() => onReview(sig.id)} className="p-1.5 rounded-lg hover:bg-ink-700 text-sky-400" title="Mark reviewed">
                <CheckCircle2 className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => onReject(sig.id)} className="p-1.5 rounded-lg hover:bg-ink-700 text-rose-400" title="Reject">
                <XCircle className="w-3.5 h-3.5" />
              </button>
            </>
          )}
        </div>
      )} />
    </div>
  );
}

function Room2View({ signals, selected, setSelected, busy, onSelect, onEnrich }: {
  signals: SignalEvent[];
  selected: Set<number>;
  setSelected: (s: Set<number>) => void;
  busy: boolean;
  onSelect: () => void;
  onEnrich: () => void;
}) {
  const toggleSelect = (id: number) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  };

  const selectableSignals = signals.filter(s => s.status === 'new' || s.status === 'reviewed');
  const selectedSignals = signals.filter(s => s.status === 'selected');

  return (
    <div className="space-y-4">
      <Card className="flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold text-white">Selection + Enrichment</div>
          <div className="text-xs text-slate-400 mt-0.5">{selectableSignals.length} awaiting selection · {selectedSignals.length} selected for enrichment</div>
        </div>
        <div className="flex gap-2">
          <button onClick={onSelect} disabled={busy || !selected.size} className="btn-gold text-sm">
            <ArrowRight className="w-4 h-4" /> Select ({selected.size})
          </button>
          <button onClick={onEnrich} disabled={busy || !selectedSignals.length} className="px-4 py-2 rounded-xl text-sm font-semibold bg-emerald-500 text-ink-950 hover:bg-emerald-400 disabled:opacity-50 flex items-center gap-2">
            <Sparkles className="w-4 h-4" /> Enrich Selected
          </button>
        </div>
      </Card>

      <SignalTable signals={signals} selectable selectableStatuses={['new', 'reviewed']} selected={selected} onToggle={toggleSelect} />
    </div>
  );
}

function Room3View({ signals, busy, onRefresh }: { signals: SignalEvent[]; busy: boolean; onRefresh: () => void }) {
  const [form, setForm] = useState({ signal_code: '', title: '', company_name: '', company_domain: '', source_url: '', source_platform: '', evidence: '' });

  const submit = async () => {
    if (!form.source_url || !form.source_platform || !form.evidence || !form.signal_code || !form.title) return;
    await api.post('/rooms/3/create', form);
    setForm({ signal_code: '', title: '', company_name: '', company_domain: '', source_url: '', source_platform: '', evidence: '' });
    onRefresh();
  };

  const enrichManual = async (id: number) => {
    await api.post(`/rooms/3/${id}/enrich`);
    onRefresh();
  };

  return (
    <div className="space-y-4">
      <Card>
        <div className="text-sm font-semibold text-white mb-3">Submit Manual Signal</div>
        <div className="grid grid-cols-2 gap-3">
          <input className="input" placeholder="Signal code (e.g. A15)" value={form.signal_code} onChange={e => setForm({...form, signal_code: e.target.value})} />
          <input className="input" placeholder="Title" value={form.title} onChange={e => setForm({...form, title: e.target.value})} />
          <input className="input" placeholder="Company name" value={form.company_name} onChange={e => setForm({...form, company_name: e.target.value})} />
          <input className="input" placeholder="Company domain" value={form.company_domain} onChange={e => setForm({...form, company_domain: e.target.value})} />
          <input className="input" placeholder="Source URL *" value={form.source_url} onChange={e => setForm({...form, source_url: e.target.value})} />
          <input className="input" placeholder="Source platform *" value={form.source_platform} onChange={e => setForm({...form, source_platform: e.target.value})} />
          <textarea className="input col-span-2 h-20 resize-none" placeholder="Evidence text *" value={form.evidence} onChange={e => setForm({...form, evidence: e.target.value})} />
        </div>
        <button onClick={submit} disabled={busy || !form.source_url || !form.evidence || !form.signal_code} className="btn-gold mt-3">
          <PenTool className="w-4 h-4" /> Submit Signal
        </button>
      </Card>

      <SignalTable signals={signals} actions={(sig) => (
        sig.status !== 'enriched' ? (
          <button onClick={() => enrichManual(sig.id)} className="px-2 py-1 text-xs rounded-lg bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30">
            Enrich
          </button>
        ) : null
      )} />
    </div>
  );
}

function SignalTable({ signals, actions, selectable, selectableStatuses, selected, onToggle }: {
  signals: SignalEvent[];
  actions?: (sig: SignalEvent) => React.ReactNode;
  selectable?: boolean;
  selectableStatuses?: string[];
  selected?: Set<number>;
  onToggle?: (id: number) => void;
}) {
  if (!signals.length) {
    return <Card className="text-center py-8 text-slate-500 text-sm">No signals yet.</Card>;
  }

  const statusColor: Record<string, string> = {
    new: 'text-gold-400 bg-gold-500/10',
    reviewed: 'text-sky-400 bg-sky-500/10',
    selected: 'text-emerald-400 bg-emerald-500/10',
    enrichment_in_progress: 'text-amber-300 bg-amber-500/10',
    enriched: 'text-purple-400 bg-purple-500/10',
    rejected: 'text-slate-500 bg-ink-800',
  };

  return (
    <Card className="!p-0 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wider text-slate-400 border-b border-ink-700">
              {selectable && <th className="px-3 py-3 w-8"></th>}
              <th className="px-4 py-3">Signal</th>
              <th className="px-4 py-3">Company</th>
              <th className="px-4 py-3">Evidence</th>
              <th className="px-4 py-3">Source</th>
              <th className="px-4 py-3">Strength</th>
              <th className="px-4 py-3">Status</th>
              {actions && <th className="px-4 py-3"></th>}
            </tr>
          </thead>
          <tbody>
            {signals.map((sig) => {
              const canSelect = selectable && selectableStatuses?.includes(sig.status);
              return (
                <tr key={sig.id} className="border-b border-ink-800/70 hover:bg-ink-850/50 transition-colors">
                  {selectable && (
                    <td className="px-3 py-3">
                      {canSelect && (
                        <input
                          type="checkbox"
                          checked={selected?.has(sig.id) ?? false}
                          onChange={() => onToggle?.(sig.id)}
                          className="w-4 h-4 rounded border-ink-600 bg-ink-800 text-gold-500 focus:ring-gold-500/50"
                        />
                      )}
                    </td>
                  )}
                  <td className="px-4 py-3">
                    <span className="pill bg-gold-500/10 text-gold-300 border border-gold-500/30 font-mono text-[10px]">{sig.signal_code}</span>
                    <div className="text-xs text-slate-300 mt-0.5">{sig.title}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-white text-xs font-medium">{sig.company_name ?? '—'}</div>
                    <div className="text-slate-500 text-[10px]">{sig.company_domain}</div>
                  </td>
                  <td className="px-4 py-3 max-w-[220px]">
                    <div className="text-xs text-slate-300 truncate">{sig.evidence}</div>
                  </td>
                  <td className="px-4 py-3">
                    <a href={sig.source_url} target="_blank" rel="noopener" className="text-xs text-sky-400 hover:text-sky-300 flex items-center gap-1">
                      {sig.source_platform} <ExternalLink className="w-3 h-3" />
                    </a>
                  </td>
                  <td className="px-4 py-3"><ScoreBadge score={sig.strength} /></td>
                  <td className="px-4 py-3">
                    <span className={`pill text-[10px] font-semibold ${statusColor[sig.status] ?? 'text-slate-400 bg-ink-800'}`}>
                      {sig.status}
                    </span>
                  </td>
                  {actions && <td className="px-4 py-3">{actions(sig)}</td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
