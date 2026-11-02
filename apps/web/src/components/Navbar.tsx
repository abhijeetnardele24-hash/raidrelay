import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Radio, Tv, Sliders, PlayCircle } from 'lucide-react';
import type { HealthStatus } from '@raidrelay/contracts';

interface NavbarProps {
  health?: HealthStatus | null;
}

export const Navbar: React.FC<NavbarProps> = ({ health }) => {
  const location = useLocation();

  const isLive = health?.sourceMode === 'LIVE_TWITCH';

  return (
    <header className="border-b border-charcoal-700 bg-charcoal-950/90 backdrop-blur sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Link to="/" className="flex items-center gap-2.5 group">
            <div className="w-8 h-8 rounded bg-gradient-to-br from-relay-amber via-relay-emerald to-relay-cyan p-0.5">
              <div className="w-full h-full bg-charcoal-900 rounded flex items-center justify-center">
                <Radio className="w-4 h-4 text-relay-amber group-hover:text-white transition-colors" />
              </div>
            </div>
            <div className="flex flex-col">
              <span className="font-bold tracking-tight text-white text-base leading-none">RaidRelay</span>
              <span className="text-[10px] text-chalk-400 font-mono tracking-widest uppercase mt-0.5">Broadcast Control</span>
            </div>
          </Link>

          <nav className="hidden md:flex items-center gap-1 font-mono text-xs">
            <Link
              to="/"
              className={`px-3 py-1.5 rounded transition-colors ${
                location.pathname === '/' ? 'bg-charcoal-800 text-white font-semibold' : 'text-chalk-400 hover:text-white'
              }`}
            >
              Overview
            </Link>
            <Link
              to="/console"
              className={`px-3 py-1.5 rounded transition-colors flex items-center gap-1.5 ${
                location.pathname === '/console' ? 'bg-charcoal-800 text-white font-semibold' : 'text-chalk-400 hover:text-white'
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>Console</span>
            </Link>
            <Link
              to="/lab"
              className={`px-3 py-1.5 rounded transition-colors flex items-center gap-1.5 ${
                location.pathname === '/lab' ? 'bg-charcoal-800 text-relay-amber font-semibold' : 'text-chalk-400 hover:text-white'
              }`}
            >
              <PlayCircle className="w-3.5 h-3.5 text-relay-amber" />
              <span>Demo Lab (Judges)</span>
            </Link>
            <Link
              to="/overlay/demo-channel-key-12345"
              target="_blank"
              rel="noreferrer"
              className="px-3 py-1.5 rounded text-chalk-400 hover:text-white transition-colors flex items-center gap-1.5"
            >
              <Tv className="w-3.5 h-3.5" />
              <span>OBS Overlay</span>
            </Link>
          </nav>
        </div>

        {/* Live Provider / Simulation Badge */}
        <div className="flex items-center gap-3">
          <div
            data-testid="navbar-source-badge"
            className={`px-2.5 py-1 rounded text-[11px] font-mono font-semibold flex items-center gap-1.5 border ${
              isLive
                ? 'bg-relay-emerald/10 text-relay-emerald border-relay-emerald/30 shadow-emerald-glow'
                : 'bg-charcoal-800 text-relay-amber border-relay-amber/30'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                isLive ? 'bg-relay-emerald animate-pulse' : 'bg-relay-amber'
              }`}
            />
            <span>{isLive ? 'TWITCH LIVE' : 'DEMO FIXTURE'}</span>
          </div>

          <Link
            to="/lab"
            className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 bg-relay-amber hover:bg-relay-amber/90 text-charcoal-950 text-xs font-semibold rounded font-mono transition-colors shadow-amber-glow"
          >
            <span>Judge Tour</span>
          </Link>
        </div>
      </div>
      {/* Mobile navigation bar */}
      <nav aria-label="Mobile Navigation" className="md:hidden border-t border-charcoal-800 bg-charcoal-900/90 px-4 py-2 flex items-center justify-around font-mono text-xs">
        <Link
          to="/"
          className={`px-2 py-1 rounded transition-colors ${
            location.pathname === '/' ? 'text-white font-bold bg-charcoal-800' : 'text-chalk-400'
          }`}
        >
          Overview
        </Link>
        <Link
          to="/console"
          className={`px-2 py-1 rounded transition-colors ${
            location.pathname === '/console' ? 'text-white font-bold bg-charcoal-800' : 'text-chalk-400'
          }`}
        >
          Console
        </Link>
        <Link
          to="/lab"
          className={`px-2 py-1 rounded transition-colors ${
            location.pathname === '/lab' ? 'text-relay-amber font-bold bg-charcoal-800' : 'text-chalk-400'
          }`}
        >
          Demo Lab (Judges)
        </Link>
      </nav>
    </header>
  );
};
