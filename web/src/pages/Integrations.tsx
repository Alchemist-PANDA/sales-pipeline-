import { useEffect, useMemo, useState } from 'react';
import {
  Plug, Zap, Link2, ClipboardPaste, KeyRound, Wand2, CheckCircle2, X,
  ShieldCheck, Globe, Cookie, ArrowRight, Copy,
} from 'lucide-react';
import { api, Platform } from '../lib/api';
import { Card, StatusDot } from '../components/ui';

const AUTH_META: Record<string, { icon: any; label: string; tint: string }> = {
  mcp_gateway: { icon: Zap, label: 'MCP Gateway', tint: 'text-purple-300 bg-purple-500/10 border-purple-500/30' },
  api_key: { icon: KeyRound, label: 'API Key', tint: 'text-gold-300 bg-gold-500/10 border-gold-500/30' },
  oauth2: { icon: ShieldCheck, label: 'OAuth', tint: 'text-sky-300 bg-sky-500/10 border-sky-500/30' },
  cookie: { icon: Cookie, label: 'Session', tint: 'text-amber-300 bg-amber-500/10 border-amber-500/30' },
  public: { icon: Globe, label: 'Public', tint: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30' },
};

export default function Integrations() {
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [bulkFor, setBulkFor] = useState<Platform | null>(null);
  const [invites, setInvites] = useState<{ owner: string; link: string }[] | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const load = () => api.get('/registry').then((r) => setPlatforms(r.platforms));
  useEffect(() => { load(); }, []);

  const grouped = useMemo(() => {
    const g: Record<string, Platform[]> = {};
    for (const p of platforms) (g[p.category] ??= []).push(p);
    return g;
  }, [platforms]);

  const totalLive = platforms.reduce((a, p) => a + p.capacity.live, 0);

  const mintInvites = async () => {
    const r = await api.post('/credentials/invites', {});
    setInvites(r.links);
  };

  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(null), 2600); };

  return (
    <div className="p-8 space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Integrations</h1>
          <p className="text-slate-400 text-sm mt-1">
            {platforms.length} platforms · {totalLive} live account-slots in the pool. Connect in seconds — no messy manual entry.
          </p>
        </div>
        <button className="btn-gold" onClick={mintInvites}>
          <Wand2 className="w-4 h-4" /> Mint magic links (self-serve)
        </button>
      </header>

      {/* Fast-path explainer */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { icon: Zap, t: 'Gateway auto-connect', d: 'One Apify MCP token lights up a dozen scrapers at once.', c: 'text-purple-300' },
          { icon: Link2, t: 'Magic links', d: 'Each teammate pastes their own key on their phone in ~5s.', c: 'text-sky-300' },
          { icon: ClipboardPaste, t: 'Bulk paste', d: 'Drop a whole column of keys — every owner provisioned at once.', c: 'text-gold-300' },
          { icon: KeyRound, t: 'Quick connect', d: 'Single paste-and-go, auto-verified inline.', c: 'text-emerald-300' },
        ].map((x) => (
          <Card key={x.t} className="!p-4">
            <x.icon className={`w-5 h-5 ${x.c}`} />
            <div className="font-semibold text-white text-sm mt-2">{x.t}</div>
            <div className="text-[11px] text-slate-400 mt-1 leading-relaxed">{x.d}</div>
          </Card>
        ))}
      </div>

      {Object.entries(grouped).map(([cat, list]) => (
        <div key={cat}>
          <h2 className="text-xs uppercase tracking-wider text-slate-400 mb-3 mt-6">{cat}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {list.map((p) => {
              const meta = AUTH_META[p.authType];
              const pct = p.capacity.total ? (p.capacity.live / p.capacity.total) * 100 : 0;
              return (
                <Card key={p.id} className="!p-4 hover:border-gold-500/30 transition-colors">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-ink-800 grid place-items-center text-slate-300 font-bold">
                        {p.name[0]}
                      </div>
                      <div>
                        <div className="font-semibold text-white leading-tight">{p.name}</div>
                        <span className={`pill border mt-1 ${meta.tint}`}>
                          <meta.icon className="w-3 h-3" /> {meta.label}
                        </span>
                      </div>
                    </div>
                    {p.gateway && (
                      <span className="pill bg-purple-500/10 text-purple-300 border border-purple-500/30 text-[10px]">
                        via {p.gateway.name}
                      </span>
                    )}
                  </div>

                  <div className="mt-3 flex items-center gap-2 text-xs text-slate-400">
                    <StatusDot status={p.capacity.live > 0 ? 'connected' : 'disconnected'} />
                    <span className="text-slate-300 font-medium">{p.capacity.live} live</span>
                    · {p.capacity.reserved} reserved · {p.capacity.total} total
                  </div>
                  <div className="h-1.5 w-full bg-ink-800 rounded-full overflow-hidden mt-2">
                    <div className="h-full bg-gradient-to-r from-gold-500 to-emerald-500" style={{ width: `${pct}%` }} />
                  </div>

                  <div className="mt-3 flex gap-2">
                    <button className="btn-ghost flex-1 justify-center !py-1.5 text-xs" onClick={() => setBulkFor(p)}>
                      <ClipboardPaste className="w-3.5 h-3.5" /> Bulk connect
                    </button>
                    {p.docs && (
                      <a href={p.docs} target="_blank" className="btn-ghost !py-1.5 text-xs" rel="noreferrer">
                        docs
                      </a>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      ))}

      {bulkFor && <BulkModal platform={bulkFor} onClose={() => setBulkFor(null)} onDone={(m) => { flash(m); load(); }} />}
      {invites && <InvitesModal invites={invites} onClose={() => setInvites(null)} onCopy={() => flash('Link copied')} />}
      {toast && (
        <div className="fixed bottom-6 right-6 card px-4 py-3 flex items-center gap-2 text-sm text-emerald-300 border-emerald-500/30">
          <CheckCircle2 className="w-4 h-4" /> {toast}
        </div>
      )}
    </div>
  );
}

function BulkModal({ platform, onClose, onDone }: { platform: Platform; onClose: () => void; onDone: (m: string) => void }) {
  const [raw, setRaw] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<any>(null);

  const submit = async () => {
    setBusy(true);
    const r = await api.post('/credentials/bulk', { platformId: platform.id, raw });
    setResult(r);
    setBusy(false);
    onDone(`${platform.name}: ${r.connected}/${r.provisioned} connected`);
  };

  return (
    <Overlay onClose={onClose}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-bold text-white text-lg flex items-center gap-2">
          <ClipboardPaste className="w-5 h-5 text-gold-400" /> Bulk connect · {platform.name}
        </h3>
        <button onClick={onClose} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
      </div>
      <p className="text-sm text-slate-400 mb-3">
        Paste one API key per line, or <code className="text-gold-300">email,key</code> rows to map to specific owners.
        Every active teammate is provisioned in one shot.
      </p>
      <textarea
        className="input font-mono text-xs h-40"
        placeholder={`sk-live-abc123...\nsk-live-def456...\n\n— or —\nmaya.alchemist@alchemist.team,sk-live-xyz`}
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
      />
      {result && (
        <div className="mt-3 max-h-32 overflow-auto space-y-1">
          {result.results.map((r: any, i: number) => (
            <div key={i} className="flex items-center gap-2 text-xs">
              <StatusDot status={r.ok ? 'connected' : 'error'} />
              <span className="text-slate-400">Owner {r.owner ?? '—'}: {r.detail}</span>
            </div>
          ))}
        </div>
      )}
      <div className="flex justify-end gap-2 mt-4">
        <button className="btn-ghost" onClick={onClose}>Close</button>
        <button className="btn-gold" onClick={submit} disabled={busy || !raw.trim()}>
          {busy ? 'Connecting…' : 'Connect all'} <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </Overlay>
  );
}

function InvitesModal({ invites, onClose, onCopy }: { invites: { owner: string; link: string }[]; onClose: () => void; onCopy: () => void }) {
  const origin = location.origin;
  return (
    <Overlay onClose={onClose}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-bold text-white text-lg flex items-center gap-2">
          <Wand2 className="w-5 h-5 text-gold-400" /> Magic links minted
        </h3>
        <button onClick={onClose} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
      </div>
      <p className="text-sm text-slate-400 mb-3">
        Send each teammate their link. They open it, paste their own keys, done — you never touch 900 secrets.
      </p>
      <div className="max-h-72 overflow-auto space-y-2">
        {invites.map((v) => (
          <div key={v.link} className="flex items-center gap-3 bg-ink-900 rounded-xl px-3 py-2">
            <span className="text-sm text-slate-200 w-36 truncate">{v.owner}</span>
            <code className="text-xs text-gold-300 flex-1 truncate">{origin}{v.link}</code>
            <button className="btn-ghost !py-1 !px-2" onClick={() => { navigator.clipboard.writeText(origin + v.link); onCopy(); }}>
              <Copy className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
      <div className="flex justify-end mt-4">
        <button className="btn-gold" onClick={onClose}>Done</button>
      </div>
    </Overlay>
  );
}

function Overlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm grid place-items-center z-50 p-4" onClick={onClose}>
      <div className="card p-6 w-full max-w-lg" onClick={(e) => e.stopPropagation()}>{children}</div>
    </div>
  );
}
