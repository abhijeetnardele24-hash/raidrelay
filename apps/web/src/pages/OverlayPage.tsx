import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import type { RitualSnapshot } from '@raidrelay/contracts';
import { CheckCircle2, Clock } from 'lucide-react';

export const OverlayPage: React.FC = () => {
  const { channelKey = 'demo-channel-key-12345' } = useParams<{ channelKey: string }>();
  const [snapshot, setSnapshot] = useState<RitualSnapshot | null>(null);

  useEffect(() => {
    // 1. Establish WebSocket connection to backend /realtime
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/realtime?channelKey=${channelKey}&isOverlay=true`;

    let ws: WebSocket | null = null;
    let reconnectTimer: NodeJS.Timeout | null = null;

    const connect = () => {
      ws = new WebSocket(wsUrl);

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'RITUAL_SNAPSHOT' && msg.data) {
            setSnapshot(msg.data);
          }
        } catch {
          // Ignore
        }
      };

      ws.onclose = () => {
        reconnectTimer = setTimeout(connect, 2000);
      };

      ws.onerror = () => {
        ws?.close();
      };
    };

    connect();

    // 2. Fallback polling every 500ms in case WebSocket is unavailable
    const pollInterval = setInterval(async () => {
      try {
        const res = await fetch('/api/ritual/current');
        if (res.ok) {
          const json = await res.json();
          if (json.active && json.ritual) {
            setSnapshot(json.ritual);
          } else if (!json.active) {
            setSnapshot((prev) => (prev?.state !== 'IDLE' ? { ...prev!, state: 'IDLE' } : prev));
          }
        }
      } catch {
        // ignore
      }
    }, 500);

    return () => {
      if (reconnectTimer) clearTimeout(reconnectTimer);
      clearInterval(pollInterval);
      if (ws) ws.close();
    };
  }, [channelKey]);

  if (!snapshot || snapshot.state === 'IDLE' || snapshot.state === 'CLEARED') {
    return <div className="w-screen h-screen bg-transparent" />;
  }

  const { state, raiderDisplayName, viewerCount, activity, goal, communityNorm, optionA, optionB, votesA, votesB, selectedOption, timeRemainingMs, sourceMode } = snapshot;

  const totalVotes = votesA + votesB;
  const percentA = totalVotes > 0 ? Math.round((votesA / totalVotes) * 100) : 50;
  const percentB = totalVotes > 0 ? 100 - percentA : 50;
  const secondsLeft = Math.ceil(timeRemainingMs / 1000);

  return (
    <div
      role="region"
      aria-label="RaidRelay Broadcast Overlay"
      aria-live="polite"
      className="w-screen h-screen bg-transparent flex flex-col justify-end p-12 overflow-hidden select-none pointer-events-none font-mono"
    >
      <div className="max-w-2xl w-full mx-auto space-y-3 transition-all duration-500 ease-out">
        {/* Source Mode Tally Indicator for Simulation Disclosure */}
        {sourceMode === 'SIMULATED' && (
          <div className="flex justify-end">
            <span
              data-testid="overlay-simulated-label"
              className="px-2.5 py-0.5 rounded bg-charcoal-950/90 border border-relay-amber/40 text-relay-amber font-mono font-bold text-[10px] tracking-widest uppercase shadow-broadcast"
            >
              SIMULATED EVENT FEED — NOT TWITCH LIVE
            </span>
          </div>
        )}

        {/* STATE 1: LANDING — Raider Arrival */}
        {state === 'LANDING' && (
          <div
            data-testid="overlay-landing-card"
            className="p-6 rounded-xl bg-charcoal-950/95 border-2 border-relay-amber text-white shadow-broadcast space-y-3 animate-fade-in"
          >
            <div className="flex items-center justify-between border-b border-charcoal-700 pb-2">
              <div className="flex items-center gap-2 text-relay-amber font-bold text-xs uppercase tracking-wider">
                <span className="w-2.5 h-2.5 rounded-full bg-relay-amber animate-ping" />
                <span>INCOMING RAID ARRIVING</span>
              </div>
              <span className="text-[11px] text-chalk-400 font-mono">00:04</span>
            </div>

            <div className="flex items-center justify-between pt-1">
              <div>
                <span className="text-xs text-chalk-400 block">Welcoming</span>
                <span className="text-2xl font-black tracking-tight text-white">{raiderDisplayName}</span>
              </div>

              <div className="text-right">
                <span className="text-xs text-chalk-400 block">Raiding Party</span>
                <span className="text-2xl font-black text-relay-amber">+{viewerCount} Viewers</span>
              </div>
            </div>

            <div className="p-2.5 rounded bg-charcoal-900 border border-charcoal-800 text-xs text-chalk-200 text-center">
              Welcome raiders! Landing context card loading...
            </div>
          </div>
        )}

        {/* STATE 2: CONTEXT — Destination Stream Now Card */}
        {state === 'CONTEXT' && (
          <div
            data-testid="overlay-context-card"
            className="p-6 rounded-xl bg-charcoal-950/95 border-2 border-relay-cyan text-white shadow-broadcast space-y-3 animate-fade-in"
          >
            <div className="flex items-center justify-between border-b border-charcoal-700 pb-2">
              <div className="flex items-center gap-2 text-relay-cyan font-bold text-xs uppercase tracking-wider">
                <span className="w-2.5 h-2.5 rounded-full bg-relay-cyan animate-pulse" />
                <span>WHERE YOU LANDED — STREAM CONTEXT</span>
              </div>
              <span className="text-[11px] text-chalk-400 font-mono">00:06</span>
            </div>

            <div className="space-y-2 pt-1 text-xs">
              <div>
                <span className="text-chalk-400 block text-[10px] uppercase font-bold tracking-wider">Current Activity</span>
                <span className="text-base font-bold text-white block">{activity}</span>
              </div>

              <div>
                <span className="text-chalk-400 block text-[10px] uppercase font-bold tracking-wider">Stream Goal</span>
                <span className="text-sm text-relay-cyan block">{goal}</span>
              </div>

              <div>
                <span className="text-chalk-400 block text-[10px] uppercase font-bold tracking-wider">Community Norm</span>
                <span className="text-xs text-chalk-300 block">{communityNorm}</span>
              </div>
            </div>
          </div>
        )}

        {/* STATE 3: VOTING & AWAITING STREAMER — Collective Choice */}
        {(state === 'VOTING' || state === 'AWAITING_STREAMER') && (
          <div
            data-testid="overlay-voting-card"
            className="p-6 rounded-xl bg-charcoal-950/95 border-2 border-relay-amber text-white shadow-broadcast space-y-4 animate-fade-in"
          >
            <div className="flex items-center justify-between border-b border-charcoal-700 pb-2">
              <div className="flex items-center gap-2 text-relay-amber font-bold text-xs uppercase tracking-wider">
                <span className="w-2.5 h-2.5 rounded-full bg-relay-amber animate-pulse" />
                <span>
                  {state === 'VOTING' ? 'TWO COMMUNITIES, ONE CHOICE' : 'AWAITING STREAMER APPROVAL'}
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <Clock className="w-3.5 h-3.5 text-relay-amber" />
                <span className="font-bold text-white">{secondsLeft}s</span>
              </div>
            </div>

            {/* Instruction Callout */}
            <div className="text-center text-xs text-chalk-200">
              Type <strong className="text-relay-amber">!relay A</strong> or{' '}
              <strong className="text-relay-cyan">!relay B</strong> in chat to vote
            </div>

            {/* Live Vote Meters */}
            <div className="space-y-3">
              <div className="p-3 rounded bg-charcoal-900 border border-charcoal-700 flex items-center justify-between text-xs">
                <div className="space-y-0.5">
                  <span className="text-relay-amber font-bold text-xs block">[Option A]</span>
                  <span className="text-white font-bold">{optionA}</span>
                </div>
                <div className="text-right">
                  <span className="text-base font-black text-relay-amber font-mono">{votesA}</span>
                  <span className="text-[10px] text-chalk-400 block">{percentA}%</span>
                </div>
              </div>

              <div className="p-3 rounded bg-charcoal-900 border border-charcoal-700 flex items-center justify-between text-xs">
                <div className="space-y-0.5">
                  <span className="text-relay-cyan font-bold text-xs block">[Option B]</span>
                  <span className="text-white font-bold">{optionB}</span>
                </div>
                <div className="text-right">
                  <span className="text-base font-black text-relay-cyan font-mono">{votesB}</span>
                  <span className="text-[10px] text-chalk-400 block">{percentB}%</span>
                </div>
              </div>

              {/* Proportional Split Bar */}
              <div className="w-full h-2.5 bg-charcoal-900 rounded-full overflow-hidden flex border border-charcoal-700">
                <div className="bg-relay-amber transition-all duration-300" style={{ width: `${percentA}%` }} />
                <div className="bg-relay-cyan transition-all duration-300" style={{ width: `${percentB}%` }} />
              </div>
            </div>
          </div>
        )}

        {/* STATE 4: RESULT — Merged Community Relay Card */}
        {state === 'RESULT' && (
          <div
            data-testid="overlay-result-card"
            className="p-6 rounded-xl bg-charcoal-950/95 border-2 border-relay-emerald text-white shadow-emerald-glow space-y-4 animate-fade-in"
          >
            <div className="flex items-center justify-between border-b border-charcoal-700 pb-2">
              <div className="flex items-center gap-2 text-relay-emerald font-bold text-xs uppercase tracking-wider">
                <CheckCircle2 className="w-4 h-4 text-relay-emerald" />
                <span>RELAY CARD — TOGETHER WE CHOSE</span>
              </div>
              <span className="text-xs font-bold text-relay-emerald font-mono">{secondsLeft}s remaining</span>
            </div>

            <div className="p-4 rounded-lg bg-charcoal-900/90 border border-relay-emerald/30 text-center space-y-1">
              <span className="text-[11px] text-chalk-400 uppercase tracking-widest font-bold block">
                Chosen Stream Challenge
              </span>
              <span className="text-xl font-black text-white block">
                {selectedOption === 'A' ? optionA : optionB}
              </span>
            </div>

            <div className="flex items-center justify-between text-xs text-chalk-300 font-mono pt-1">
              <span>Handoff completed successfully</span>
              <span className="text-relay-emerald font-bold">{totalVotes} Community Participants</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
