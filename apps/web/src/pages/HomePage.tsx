import React from 'react';
import { Link } from 'react-router-dom';
import {
  PlayCircle,
  Sliders,
  Tv,
  CheckCircle2,
  Layers,
  ArrowRight,
  Zap,
} from 'lucide-react';

export const HomePage: React.FC = () => {
  return (
    <div className="space-y-16 py-12 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      {/* Hero Section */}
      <section className="text-center space-y-6 max-w-4xl mx-auto pt-6">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-relay-amber/10 border border-relay-amber/30 text-relay-amber text-xs font-mono font-semibold">
          <Zap className="w-3.5 h-3.5" />
          <span>Codex x TwitchCon Hackathon 2026</span>
        </div>

        <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-white leading-tight">
          The first 90 seconds after a Twitch raid,{' '}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-relay-amber via-relay-emerald to-relay-cyan">
            designed.
          </span>
        </h1>

        <p className="text-lg sm:text-xl text-chalk-200 leading-relaxed font-sans max-w-3xl mx-auto">
          A raid is not an alert; it is a community handoff. RaidRelay makes that handoff understandable,
          participatory, and safe in 90 seconds.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-4 pt-4 font-mono text-sm">
          <Link
            to="/lab"
            className="px-6 py-3 rounded bg-relay-amber hover:bg-relay-amber/90 text-charcoal-950 font-bold transition-all flex items-center gap-2 shadow-amber-glow"
          >
            <PlayCircle className="w-4 h-4" />
            <span>Launch 90-Second Demo Lab</span>
          </Link>

          <Link
            to="/console"
            className="px-6 py-3 rounded bg-charcoal-800 hover:bg-charcoal-700 border border-charcoal-600 text-white font-semibold transition-all flex items-center gap-2"
          >
            <Sliders className="w-4 h-4 text-relay-cyan" />
            <span>Open Broadcaster Console</span>
          </Link>

          <Link
            to="/overlay/demo-channel-key-12345"
            target="_blank"
            rel="noreferrer"
            className="px-6 py-3 rounded bg-charcoal-800 hover:bg-charcoal-700 border border-charcoal-600 text-chalk-200 hover:text-white font-semibold transition-all flex items-center gap-2"
          >
            <Tv className="w-4 h-4 text-relay-emerald" />
            <span>OBS Overlay (1080p)</span>
          </Link>
        </div>
      </section>

      {/* The Core 3-Step Journey */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="p-6 rounded-lg bg-charcoal-800 border border-charcoal-700 space-y-4 hover:border-relay-amber/50 transition-colors">
          <div className="w-10 h-10 rounded bg-relay-amber/10 border border-relay-amber/30 flex items-center justify-center text-relay-amber font-mono font-bold">
            01
          </div>
          <h3 className="text-lg font-bold text-white">Arrival Context Capsule</h3>
          <p className="text-sm text-chalk-400 leading-relaxed">
            Incoming raiders immediately see the destination streamer's current activity, goal, and community norm.
            No awkward "so what are we doing here?" silence.
          </p>
        </div>

        <div className="p-6 rounded-lg bg-charcoal-800 border border-charcoal-700 space-y-4 hover:border-relay-cyan/50 transition-colors">
          <div className="w-10 h-10 rounded bg-relay-cyan/10 border border-relay-cyan/30 flex items-center justify-center text-relay-cyan font-mono font-bold">
            02
          </div>
          <h3 className="text-lg font-bold text-white">Bounded Collective Choice</h3>
          <p className="text-sm text-chalk-400 leading-relaxed">
            Both regular viewers and incoming raiders vote with <code className="text-relay-cyan font-mono">!relay A</code> or <code className="text-relay-cyan font-mono">!relay B</code>.
            Strict one-person/one-vote invariant with no subscriber or Bits volume weighting.
          </p>
        </div>

        <div className="p-6 rounded-lg bg-charcoal-800 border border-charcoal-700 space-y-4 hover:border-relay-emerald/50 transition-colors">
          <div className="w-10 h-10 rounded bg-relay-emerald/10 border border-relay-emerald/30 flex items-center justify-center text-relay-emerald font-mono font-bold">
            03
          </div>
          <h3 className="text-lg font-bold text-white">Streamer-Approved Relay Card</h3>
          <p className="text-sm text-chalk-400 leading-relaxed">
            The streamer retains sovereign control to approve, override, or clear. The two communities visibly merge
            on stream into a unified 20-second challenge Relay Card.
          </p>
        </div>
      </section>

      {/* Architecture & Safety Boundary */}
      <section className="p-8 rounded-xl bg-charcoal-800/80 border border-charcoal-700 space-y-6">
        <div className="flex items-center justify-between border-b border-charcoal-700 pb-4">
          <div className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-relay-cyan" />
            <h2 className="text-xl font-bold text-white font-mono">Architecture & Safety Protocol</h2>
          </div>
          <span className="text-xs font-mono px-2.5 py-1 rounded bg-charcoal-700 text-chalk-200">
            Server-Authoritative Ritual
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 text-sm">
          <div className="space-y-4 text-chalk-300">
            <p className="leading-relaxed">
              RaidRelay is engineered from the ground up to prevent raid fatigue, chat spam, and stream hijacking.
              External input is strictly isolated before it reaches the ritual state machine:
            </p>
            <ul className="space-y-2.5">
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-relay-emerald shrink-0 mt-0.5" />
                <span><strong>Zero Free-Form Text on Stream:</strong> Only streamer pre-approved choices appear on the overlay.</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-relay-emerald shrink-0 mt-0.5" />
                <span><strong>HMAC-Salted Voter Privacy:</strong> Twitch user IDs are ephemeral hashed; raw chatter IDs are never retained for analytics.</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-relay-emerald shrink-0 mt-0.5" />
                <span><strong>Event Deduplication & Stale-Replay Guards:</strong> EventSub message IDs prevent duplicate triggers with strict timestamp tolerance.</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-relay-emerald shrink-0 mt-0.5" />
                <span><strong>Instant Panic Clear:</strong> One-click emergency button returns the broadcast overlay to transparent idle immediately.</span>
              </li>
            </ul>
          </div>

          <div className="p-5 rounded bg-charcoal-900 border border-charcoal-700 font-mono text-xs space-y-3">
            <div className="flex items-center justify-between text-chalk-400 border-b border-charcoal-800 pb-2">
              <span>RITUAL LIFECYCLE SEQUENCE</span>
              <span className="text-relay-emerald">DETERMINISTIC</span>
            </div>
            <div className="space-y-1.5 text-chalk-200">
              <div className="flex items-center justify-between">
                <span>[00-04s] LANDING</span>
                <span className="text-relay-amber">Welcome incoming raiders & count</span>
              </div>
              <div className="flex items-center justify-between">
                <span>[04-10s] CONTEXT</span>
                <span className="text-relay-cyan">Now Card (activity, goal, norm)</span>
              </div>
              <div className="flex items-center justify-between">
                <span>[10-55s] VOTING</span>
                <span className="text-white">!relay A vs !relay B (1 vote/user)</span>
              </div>
              <div className="flex items-center justify-between">
                <span>[55-70s] APPROVAL</span>
                <span className="text-chalk-400">Streamer Approve / Override / Skip</span>
              </div>
              <div className="flex items-center justify-between">
                <span>[70-90s] RELAY CARD</span>
                <span className="text-relay-emerald">Merged community result & challenge timer</span>
              </div>
              <div className="flex items-center justify-between border-t border-charcoal-800 pt-2 text-chalk-400">
                <span>[90s+] IDLE</span>
                <span>Transparent OBS source</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 60-Second Judge Tour Card */}
      <section className="p-8 rounded-xl bg-gradient-to-r from-charcoal-800 via-charcoal-800 to-charcoal-900 border-2 border-relay-amber/40 space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <span className="text-xs font-mono font-bold uppercase tracking-wider text-relay-amber">
              Judges & Reviewers
            </span>
            <h2 className="text-2xl font-bold text-white font-mono">
              60-Second Interactive Demonstration
            </h2>
            <p className="text-sm text-chalk-300 max-w-2xl">
              Experience the complete incoming raid ritual right now. The Demo Lab simulates a realistic Twitch raid,
              streams synthetic chat votes, and drives both the Broadcaster Console and 1080p OBS Overlay simultaneously.
            </p>
          </div>

          <Link
            to="/lab"
            className="px-6 py-3 rounded bg-relay-amber hover:bg-relay-amber/90 text-charcoal-950 font-bold font-mono text-sm transition-all flex items-center gap-2 whitespace-nowrap shadow-amber-glow"
          >
            <span>Enter Demo Lab</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>
    </div>
  );
};
