import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { Card, ProductTag } from '../components/ui';

interface Sig {
  code: string; part: 'A' | 'B'; title: string; category: string;
  product: string; weight: number; platforms: string[];
}

export default function Signals() {
  const [signals, setSignals] = useState<Sig[]>([]);
  const [part, setPart] = useState<'ALL' | 'A' | 'B'>('ALL');
  const [product, setProduct] = useState<'ALL' | 'GEO' | 'AR' | 'BOTH'>('ALL');

  useEffect(() => { api.get('/signals').then((r) => setSignals(r.signals)); }, []);

  const filtered = useMemo(
    () => signals.filter((s) => (part === 'ALL' || s.part === part) && (product === 'ALL' || s.product === product)),
    [signals, part, product],
  );

  return (
    <div className="p-8 space-y-6">
      <header className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Signal Catalog</h1>
          <p className="text-slate-400 text-sm mt-1">
            60 verified buying signals — 30 from the playbook (A) + 30 extended (B). Each is a scoreable rule the engine runs.
          </p>
        </div>
        <div className="flex gap-2">
          <Filter label="Part" value={part} setValue={setPart as any} opts={['ALL', 'A', 'B']} />
          <Filter label="Product" value={product} setValue={setProduct as any} opts={['ALL', 'GEO', 'AR', 'BOTH']} />
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {filtered.map((s) => (
          <Card key={s.code} className="!p-4">
            <div className="flex items-start justify-between">
              <span className={`pill font-mono border ${s.part === 'A' ? 'text-sky-300 border-sky-500/30 bg-sky-500/10' : 'text-purple-300 border-purple-500/30 bg-purple-500/10'}`}>
                {s.code}
              </span>
              <div className="flex items-center gap-2">
                <ProductTag product={s.product} />
                <span className="pill bg-gold-500/10 text-gold-300 border border-gold-500/30 font-mono">+{s.weight}</span>
              </div>
            </div>
            <div className="font-semibold text-white text-sm mt-2 leading-snug">{s.title}</div>
            <div className="text-[11px] text-slate-500 mt-1">{s.category}</div>
            <div className="flex flex-wrap gap-1 mt-2">
              {s.platforms.map((p) => (
                <span key={p} className="pill bg-ink-800 border border-ink-600 text-slate-400 text-[10px]">{p}</span>
              ))}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function Filter({ label, value, setValue, opts }: { label: string; value: string; setValue: (v: string) => void; opts: string[] }) {
  return (
    <div className="flex items-center gap-1 bg-ink-800 rounded-xl p-1">
      <span className="text-[11px] text-slate-500 px-2">{label}</span>
      {opts.map((o) => (
        <button key={o} onClick={() => setValue(o)}
          className={`px-2.5 py-1 rounded-lg text-xs font-medium ${value === o ? 'bg-gold-500 text-ink-950' : 'text-slate-300 hover:bg-ink-700'}`}>
          {o}
        </button>
      ))}
    </div>
  );
}
