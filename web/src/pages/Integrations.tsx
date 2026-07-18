import { useEffect, useMemo, useState } from 'react';
import {
  Zap, Link2, ClipboardPaste, KeyRound, Wand2, CheckCircle2, X,
  ShieldCheck, Globe, Cookie, ArrowRight, Copy, MousePointerClick,
  Boxes, Bot, Loader2, Sparkles,
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
  const [captureFor, setCaptureFor] = useState<Platform | null>(null);
  const [invites, setInvites] = useState<{ owner: string; link: string }[] | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const load = () => api.get('/registry').then((r) => setPlatforms(r.platforms));
  useEffect(() => { load(); }, []);

  // Table 1 = API-oriented platforms; Table 2 = scraper platforms. The
  // Crawlee engine row is infrastructure, shown as a badge not a card.
  const apiPlatforms = useMemo(
    () => platforms.filter((p) => !p.scraper && p.id !== 'crawlee_engine'),
    [platforms],
  );
  const scraperPlatforms = useMemo(() => platforms.filter((p) => p.scraper), [platforms]);

  const groupedApi = useMemo(() => {
    const g: Record<string, Platform[]> = {};
    for (const p of apiPlatforms) (g[p.category] ??= []).push(p);
    return g;
  }, [apiPlatforms]);

  const totalLive = platforms.reduce((a, p) => a + p.capacity.live, 0);

  const mintInvites = async () => {
    const r = await api.post('/credentials/invites', {});
    setInvites(r.links);
  };

  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(null), 3000); };

  return (
    <div className="p-8 space-y-8">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Integrations</h1>
          <p className="text-slate-400 text-sm mt-1">
            {platforms.length} platforms · {totalLive} live account-slots in the pool.
            Two paths: paste every API key once, or one-click all scraping.
          </p>
        </div>
        <button className="btn-ghost" onClick={mintInvites}>
          <Wand2 className="w-4 h-4" /> Mint magic links
        </button>
      </header>

      {/* ════════ TABLE 1 — MASTER KEY CONSOLE ════════ */}
      <MasterConsole apiCount={apiPlatforms.length} onDone={(m) => { flash(m); load(); }} />

      {/* ════════ TABLE 2 — ONE-CLICK SCRAPING ════════ */}
      <ScrapingConsole
        platforms={scraperPlatforms}
        onDone={(m) => { flash(m); load(); }}
        onCapture={(p) => setCaptureFor(p)}
      />

      {/* API platform grid, grouped by category (Table 1 detail) */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Boxes className="w-4 h-4 text-gold-400" />
          <h2 className="text-sm font-semibold text-white">API-oriented platforms</h2>
          <span className="text-xs text-slate-500">({apiPlatforms.length})</span>
        </div>
        <p className="text-xs text-slate-500 mb-4">
          Managed by the Master Key Console above — the pool rotates keys automatically. Per-platform bulk paste still available.
        </p>
        {Object.entries(groupedApi).map(([cat, list]) => (
          <div key={cat} className="mb-5">
            <h3 className="text-xs uppercase tracking-wider text-slate-400 mb-3">{cat}</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {list.map((p) => (
                <PlatformCard key={p.id} p={p} onBulk={() => setBulkFor(p)} />
              ))}
            </div>
          </div>
        ))}
      </div>

      {bulkFor && <BulkModal platform={bulkFor} onClose={() => setBulkFor(null)} onDone={(m) => { flash(m); load(); }} />}
      {captureFor && <CaptureModal platform={captureFor} onClose={() => setCaptureFor(null)} onDone={(m) => { flash(m); load(); }} />}
      {invites && <InvitesModal invites={invites} onClose={() => setInvites(null)} onCopy={() => flash('Link copied')} />}
      {toast && (
        <div className="fixed bottom-6 right-6 card px-4 py-3 flex items-center gap-2 text-sm text-emerald-300 border-emerald-500/30 z-50">
          <CheckCircle2 className="w-4 h-4" /> {toast}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────── TABLE 1: Master Key Console ─────────────────────── */
function MasterConsole({ apiCount, onDone }: { apiCount: number; onDone: (m: string) => void }) {
  const [raw, setRaw] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<any>(null);

  const submit = async () => {
    setBusy(true);
    try {
      const r = await api.post('/credentials/master', { raw });
      setResult(r);
      onDone(`Master console: ${r.totalConnected}/${r.totalKeys} keys live across ${r.platforms} platforms`);
    } finally {
      setBusy(false);
    }
  };

  const example =
    '# Paste every API key here — one place for all of Table 1.\n' +
    '# Format:  platform: key1, key2, key3   (keys round-robin across owners)\n\n' +
    'apollo: sk_live_a1b2c3, sk_live_d4e5f6, sk_live_g7h8i9\n' +
    'hunter: hk_11aa22, hk_33bb44\n' +
    'clay: clay_key_xyz\n\n' +
    '# or header + one key per line:\n' +
    'lusha\n' +
    'lu_key_001\n' +
    'lu_key_002';

  return (
    <Card className="!p-0 overflow-hidden border-gold-500/25">
      <div className="bg-gradient-to-r from-gold-500/10 to-transparent px-6 py-4 border-b border-white/5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gold-500/15 grid place-items-center">
            <KeyRound className="w-5 h-5 text-gold-300" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-bold text-white">Master Key Console</h2>
              <span className="pill bg-gold-500/10 text-gold-300 border border-gold-500/30 text-[10px]">Table 1 · {apiCount} platforms</span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Write all your API keys in one box. The system seals, tests, and rotates them across the 30-owner pool — no per-platform work.
            </p>
          </div>
        </div>
      </div>
      <div className="p-6 grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2">
          <textarea
            className="input font-mono text-xs h-52 leading-relaxed"
            placeholder={example}
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
          />
          <div className="flex items-center justify-between mt-3">
            <span className="text-[11px] text-slate-500">
              Keys are AES-256-GCM sealed. Distribution is round-robin across active owners; rotation is automatic thereafter.
            </span>
            <button className="btn-gold" onClick={submit} disabled={busy || !raw.trim()}>
              {busy ? <><Loader2 className="w-4 h-4 animate-spin" /> Provisioning…</> : <><Sparkles className="w-4 h-4" /> Provision all keys</>}
            </button>
          </div>
        </div>
        <div className="bg-ink-900 rounded-xl p-4">
          <div className="text-xs font-semibold text-slate-300 mb-2">Result</div>
          {!result ? (
            <div className="text-[11px] text-slate-500 leading-relaxed">
              Paste your keys and hit provision. You'll see a per-platform breakdown here:
              how many keys connected, failed, or were skipped (more keys than owners).
            </div>
          ) : (
            <div className="space-y-1.5 max-h-44 overflow-auto">
              <div className="text-[11px] text-emerald-300 mb-1">
                {result.totalConnected}/{result.totalKeys} keys live · {result.owners} owners
              </div>
              {result.summary.map((s: any) => (
                <div key={s.platformId} className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-300">{s.platform}</span>
                  <span className="text-slate-500">
                    <span className="text-emerald-400">{s.connected}✓</span>
                    {s.failed ? <span className="text-red-400"> {s.failed}✕</span> : null}
                    {s.skipped ? <span className="text-amber-400"> {s.skipped}⤳</span> : null}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

/* ─────────────────────── TABLE 2: One-Click Scraping ─────────────────────── */
function ScrapingConsole({
  platforms, onDone, onCapture,
}: {
  platforms: Platform[];
  onDone: (m: string) => void;
  onCapture: (p: Platform) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<any>(null);

  const publicOnes = platforms.filter((p) => !p.sessionCapture);
  const loginOnes = platforms.filter((p) => p.sessionCapture);

  const enableAll = async () => {
    setBusy(true);
    try {
      const r = await api.post('/credentials/scraping/one-click', {});
      setResult(r);
      onDone(`Scraping enabled: ${r.instantSlots} instant + ${r.loginSlots} login slots across ${r.owners} owners`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="!p-0 overflow-hidden border-emerald-500/25">
      <div className="bg-gradient-to-r from-emerald-500/10 to-transparent px-6 py-4 border-b border-white/5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/15 grid place-items-center">
              <Bot className="w-5 h-5 text-emerald-300" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-bold text-white">One-Click Scraping</h2>
                <span className="pill bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 text-[10px]">Table 2 · {platforms.length} platforms</span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Self-hosted Crawlee engine. No manual cookie hunting — public sites go live instantly, login sites use automated session capture.
              </p>
            </div>
          </div>
          <button className="btn-gold !bg-emerald-500 hover:!bg-emerald-400" onClick={enableAll} disabled={busy}>
            {busy ? <><Loader2 className="w-4 h-4 animate-spin" /> Enabling…</> : <><MousePointerClick className="w-4 h-4" /> Enable all scraping</>}
          </button>
        </div>
      </div>
      <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Public — instant */}
        <div className="bg-ink-900 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Globe className="w-4 h-4 text-emerald-300" />
            <span className="text-sm font-semibold text-white">Public — instant</span>
            <span className="text-[10px] text-slate-500">no login needed</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {publicOnes.map((p) => (
              <span key={p.id} className="pill bg-emerald-500/5 text-emerald-200 border border-emerald-500/20 text-[11px]">
                <StatusDot status={p.capacity.live > 0 ? 'connected' : 'disconnected'} /> {p.name}
              </span>
            ))}
          </div>
        </div>
        {/* Login — automated capture */}
        <div className="bg-ink-900 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Cookie className="w-4 h-4 text-amber-300" />
            <span className="text-sm font-semibold text-white">Login — auto session capture</span>
            <span className="text-[10px] text-slate-500">login once, we harvest the cookie</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {loginOnes.map((p) => (
              <button
                key={p.id}
                onClick={() => onCapture(p)}
                className="pill bg-amber-500/5 text-amber-200 border border-amber-500/20 text-[11px] hover:border-amber-400/50 transition-colors"
                title="Capture a session (automated login)"
              >
                <StatusDot status={p.capacity.live > 0 ? 'connected' : 'disconnected'} /> {p.name}
              </button>
            ))}
          </div>
          {result && (
            <div className="text-[11px] text-slate-400 mt-3">
              {result.instantSlots} public slots live · {result.loginSlots} awaiting one login each.
              Click any login platform above to capture a session.
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

/* ──────────────────────────── Platform card ──────────────────────────────── */
function PlatformCard({ p, onBulk }: { p: Platform; onBulk: () => void }) {
  const meta = AUTH_META[p.authType];
  const pct = p.capacity.total ? (p.capacity.live / p.capacity.total) * 100 : 0;
  return (
    <Card className="!p-4 hover:border-gold-500/30 transition-colors">
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
        <button className="btn-ghost flex-1 justify-center !py-1.5 text-xs" onClick={onBulk}>
          <ClipboardPaste className="w-3.5 h-3.5" /> Bulk connect
        </button>
        {p.docs && (
          <a href={p.docs} target="_blank" className="btn-ghost !py-1.5 text-xs" rel="noreferrer">docs</a>
        )}
      </div>
    </Card>
  );
}

/* ─────────────────── Automated session capture modal ─────────────────────── */
function CaptureModal({ platform, onClose, onDone }: { platform: Platform; onClose: () => void; onDone: (m: string) => void }) {
  const [ownerId, setOwnerId] = useState('1');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await api.post('/credentials/scraping/capture', {
        ownerId: Number(ownerId), platformId: platform.id, email, password,
      });
      if (r.ok) {
        onDone(`${platform.name}: session captured for owner ${ownerId}`);
        onClose();
      } else {
        setMsg(r.detail || 'Capture failed');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Overlay onClose={onClose}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-bold text-white text-lg flex items-center gap-2">
          <Bot className="w-5 h-5 text-emerald-400" /> Auto-capture session · {platform.name}
        </h3>
        <button onClick={onClose} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
      </div>
      <p className="text-sm text-slate-400 mb-4">
        Log in once — the engine drives a stealth browser, signs in, and harvests the session cookie automatically.
        The password is used only to log in and is <span className="text-emerald-300">never stored</span>.
      </p>
      <div className="space-y-3">
        <div>
          <label className="text-xs text-slate-400">Owner ID (pool slot)</label>
          <input className="input mt-1" value={ownerId} onChange={(e) => setOwnerId(e.target.value)} placeholder="1" />
        </div>
        <div>
          <label className="text-xs text-slate-400">Account email</label>
          <input className="input mt-1" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="teammate@company.com" />
        </div>
        <div>
          <label className="text-xs text-slate-400">Password (in-memory only)</label>
          <input type="password" className="input mt-1" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
        </div>
      </div>
      {msg && <div className="mt-3 text-xs text-red-400">{msg}</div>}
      <div className="flex justify-end gap-2 mt-5">
        <button className="btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn-gold !bg-emerald-500 hover:!bg-emerald-400" onClick={submit} disabled={busy || !email || !password}>
          {busy ? <><Loader2 className="w-4 h-4 animate-spin" /> Capturing…</> : <><ArrowRight className="w-4 h-4" /> Capture session</>}
        </button>
      </div>
    </Overlay>
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
