// The teammate-facing magic-link page: open on a phone, paste your own keys,
// done in seconds. This is how 30 people self-onboard without an admin ever
// touching 900 secrets.
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { FlaskConical, KeyRound, CheckCircle2, Zap } from 'lucide-react';
import { api, Platform } from '../lib/api';

export default function Connect() {
  const { token } = useParams();
  const [owner, setOwner] = useState<any>(null);
  const [connected, setConnected] = useState<string[]>([]);
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [keys, setKeys] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);

  useEffect(() => {
    api.get(`/credentials/invite/${token}`).then((r) => {
      setOwner(r.owner); setConnected(r.connected);
    }).catch(() => setInvalid(true));
    api.get('/registry').then((r) => setPlatforms(r.platforms.filter((p: Platform) => p.authType === 'api_key')));
  }, [token]);

  const connect = async (p: Platform) => {
    setSaving(p.id);
    const field = p.fields[0]?.key ?? 'apiKey';
    const r = await api.post('/credentials/connect', {
      ownerId: owner.id, platformId: p.id, secret: { [field]: keys[p.id] || '' },
    });
    if (r.status === 'connected') setConnected((c) => [...c, p.id]);
    setSaving(null);
  };

  if (invalid) return <Center><p className="text-slate-400">This invite link is invalid or expired.</p></Center>;
  if (!owner) return <Center><p className="text-slate-400">Loading…</p></Center>;

  return (
    <div className="min-h-screen grid place-items-center p-4">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-gold-400 to-gold-600 grid place-items-center shadow-glow">
            <FlaskConical className="w-6 h-6 text-ink-950" />
          </div>
          <div>
            <div className="font-bold text-white">Connect your accounts</div>
            <div className="text-xs text-slate-400">Hi {owner.name.split(' ')[0]} — this takes ~5s per tool.</div>
          </div>
        </div>

        <div className="card p-4 mb-4 bg-gradient-to-br from-emerald-500/10 to-transparent border-emerald-500/20 flex items-center gap-3">
          <Zap className="w-5 h-5 text-emerald-300 shrink-0" />
          <p className="text-xs text-slate-300">
            Your keys are encrypted (AES-256) and pooled with the team's for {connected.length ? `${connected.length} tools already live` : 'shared throughput'}. Nobody else sees them.
          </p>
        </div>

        <div className="space-y-2.5">
          {platforms.map((p) => {
            const done = connected.includes(p.id);
            return (
              <div key={p.id} className="card p-3 flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-ink-800 grid place-items-center text-slate-300 font-bold shrink-0">{p.name[0]}</div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-white">{p.name}</div>
                  {done ? (
                    <div className="text-xs text-emerald-400 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> connected</div>
                  ) : (
                    <input
                      className="input !py-1 !text-xs mt-1"
                      placeholder={`${p.fields[0]?.label ?? 'API key'}…`}
                      value={keys[p.id] ?? ''}
                      onChange={(e) => setKeys((k) => ({ ...k, [p.id]: e.target.value }))}
                    />
                  )}
                </div>
                {!done && (
                  <button className="btn-gold !py-1.5 !px-3 text-xs shrink-0" onClick={() => connect(p)} disabled={saving === p.id || !keys[p.id]}>
                    <KeyRound className="w-3.5 h-3.5" /> {saving === p.id ? '…' : 'Link'}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen grid place-items-center p-4">{children}</div>;
}
