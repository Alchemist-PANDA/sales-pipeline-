import { useEffect, useState } from 'react';
import { Power, PowerOff, Crown, Link2, CheckCircle2, Clock } from 'lucide-react';
import { api, Owner } from '../lib/api';
import { Card, StatusDot, Bar } from '../components/ui';

export default function Team() {
  const [owners, setOwners] = useState<Owner[]>([]);
  const load = () => api.get('/owners').then((r) => setOwners(r.owners));
  useEffect(() => { load(); }, []);

  const toggle = async (o: Owner) => {
    await api.post(`/owners/${o.id}/${o.status === 'active' ? 'reserve' : 'activate'}`);
    load();
  };

  const active = owners.filter((o) => o.status === 'active');
  const reserved = owners.filter((o) => o.status === 'reserved');

  return (
    <div className="p-8 space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-white">Team & Account Pool</h1>
        <p className="text-slate-400 text-sm mt-1">
          30-owner architecture · <span className="text-emerald-400 font-medium">{active.length} live</span> ·{' '}
          <span className="text-gold-400 font-medium">{reserved.length} reserved</span>. Flip a reserved owner live with one click.
        </p>
      </header>

      <Section title="Live owners" hint="Their accounts are in active rotation right now.">
        {active.map((o) => <OwnerRow key={o.id} o={o} onToggle={toggle} />)}
      </Section>

      <Section title="Reserved owners" hint="Wired into the architecture, held offline. Activate to add their pool capacity.">
        {reserved.map((o) => <OwnerRow key={o.id} o={o} onToggle={toggle} />)}
      </Section>
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="text-xs uppercase tracking-wider text-slate-400 mb-1 mt-4">{title}</h2>
      <p className="text-[11px] text-slate-500 mb-3">{hint}</p>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">{children}</div>
    </div>
  );
}

function OwnerRow({ o, onToggle }: { o: Owner; onToggle: (o: Owner) => void }) {
  const pct = o.total_accounts ? (o.connected_accounts / o.total_accounts) * 100 : 0;
  return (
    <Card className="!p-4">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 rounded-full grid place-items-center font-bold text-sm ${
            o.status === 'active' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-gold-500/15 text-gold-300'
          }`}>
            {o.name.split(' ').map((n) => n[0]).join('').slice(0, 2)}
          </div>
          <div>
            <div className="font-semibold text-white text-sm flex items-center gap-1.5">
              {o.name}
              {o.role === 'admin' && <Crown className="w-3.5 h-3.5 text-gold-400" />}
            </div>
            <div className="text-[11px] text-slate-500">{o.email}</div>
          </div>
        </div>
        <button
          onClick={() => onToggle(o)}
          className={`btn !py-1 !px-2 text-xs ${o.status === 'active' ? 'bg-ink-800 text-slate-300 hover:bg-ink-700' : 'bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25'}`}
        >
          {o.status === 'active' ? <><PowerOff className="w-3.5 h-3.5" /> Reserve</> : <><Power className="w-3.5 h-3.5" /> Activate</>}
        </button>
      </div>

      <div className="mt-3 flex items-center justify-between text-xs mb-1.5">
        <span className="flex items-center gap-1.5 text-slate-400">
          <StatusDot status={o.status} /> {o.status} · {o.share_pct}% share
        </span>
        <span className="flex items-center gap-1 text-slate-400">
          {o.invite_state === 'connected'
            ? <><CheckCircle2 className="w-3 h-3 text-emerald-400" /> onboarded</>
            : <><Clock className="w-3 h-3 text-amber-400" /> invite pending</>}
        </span>
      </div>
      <Bar value={o.connected_accounts} max={o.total_accounts} className="bg-gradient-to-r from-gold-500 to-emerald-500" />
      <div className="text-[11px] text-slate-500 mt-1">{o.connected_accounts}/{o.total_accounts} platform accounts connected</div>
    </Card>
  );
}
