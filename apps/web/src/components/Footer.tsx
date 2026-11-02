import React from 'react';
import { ShieldCheck, Terminal } from 'lucide-react';

export const Footer: React.FC = () => {
  return (
    <footer className="border-t border-charcoal-700 bg-charcoal-950 text-chalk-400 text-xs py-10 mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-charcoal-800 pb-6">
          <div className="space-y-1">
            <p className="font-semibold text-chalk-100 font-mono">
              RaidRelay — The first 90 seconds after a Twitch raid, designed.
            </p>
            <p className="text-chalk-400 text-[11px] max-w-2xl leading-relaxed">
              A raid is not an alert; it is a community handoff. RaidRelay makes that handoff understandable,
              participatory, and safe in 90 seconds. Built for the Codex x TwitchCon Hackathon 2026.
            </p>
          </div>

          <div className="flex items-center gap-2 font-mono text-[11px] bg-charcoal-900 border border-charcoal-700 px-3 py-1.5 rounded">
            <Terminal className="w-3.5 h-3.5 text-relay-cyan" />
            <span className="text-chalk-400">Codex Session:</span>
            <code className="text-chalk-100 font-bold select-all">93a16a2b-a2a0-461f-851b-7a1e342fe97f</code>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-between text-[11px] text-chalk-400 gap-3 font-mono">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-3.5 h-3.5 text-relay-emerald" />
            <span>
              Evidence Disclosure: <strong>LIVE_TWITCH</strong> strictly requires authenticated Twitch EventSub.
              Demo Lab carries immutable <strong>SIMULATED</strong> label.
            </span>
          </div>

          <div>
            <span>MIT Licensed • OpenAI Codex x Twitch EventSub WebSocket</span>
          </div>
        </div>
      </div>
    </footer>
  );
};
