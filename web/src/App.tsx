import { NavLink, Route, Routes } from 'react-router-dom';
import { LayoutDashboard, Users, Plug, Target, Radar, FlaskConical, Zap } from 'lucide-react';
import Overview from './pages/Overview';
import Leads from './pages/Leads';
import Integrations from './pages/Integrations';
import Team from './pages/Team';
import Signals from './pages/Signals';
import Connect from './pages/Connect';

const NAV = [
  { to: '/', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/leads', label: 'Signal Leads', icon: Target },
  { to: '/integrations', label: 'Integrations', icon: Plug },
  { to: '/team', label: 'Team & Pool', icon: Users },
  { to: '/signals', label: 'Signal Catalog', icon: Radar },
];

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <aside className="w-64 shrink-0 border-r border-ink-700/60 bg-ink-900/60 backdrop-blur-sm flex flex-col">
        <div className="px-5 py-6 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-gold-400 to-gold-600 grid place-items-center shadow-glow">
            <FlaskConical className="w-5 h-5 text-ink-950" />
          </div>
          <div>
            <div className="font-bold text-white leading-tight">Signal Forge</div>
            <div className="text-[11px] text-gold-400/80 tracking-wide">THE SALES ALCHEMIST</div>
          </div>
        </div>
        <nav className="px-3 mt-2 space-y-1">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                  isActive ? 'bg-gold-500/15 text-gold-300 border border-gold-500/20' : 'text-slate-400 hover:text-slate-100 hover:bg-ink-800'
                }`
              }
            >
              <n.icon className="w-4.5 h-4.5" style={{ width: 18, height: 18 }} />
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto p-4">
          <div className="card p-4 bg-gradient-to-br from-gold-500/10 to-transparent border-gold-500/20">
            <div className="flex items-center gap-2 text-gold-300 text-xs font-semibold">
              <Zap className="w-3.5 h-3.5" /> 30-OWNER POOL
            </div>
            <p className="text-[11px] text-slate-400 mt-1.5 leading-relaxed">
              15 live · 15 reserved. Every call auto-rotates across the pool for 30× throughput.
            </p>
          </div>
        </div>
      </aside>

      <main className="flex-1 overflow-x-hidden">{children}</main>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/connect/:token" element={<Connect />} />
      <Route
        path="*"
        element={
          <Shell>
            <Routes>
              <Route path="/" element={<Overview />} />
              <Route path="/leads" element={<Leads />} />
              <Route path="/integrations" element={<Integrations />} />
              <Route path="/team" element={<Team />} />
              <Route path="/signals" element={<Signals />} />
            </Routes>
          </Shell>
        }
      />
    </Routes>
  );
}
