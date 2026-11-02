import React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchDemoRitual,
  fetchDemoCapability,
  runDemo,
  resetDemo,
  approveDemoRitual,
  overrideDemoRitual,
  skipDemoRitual,
  clearDemoRitual,
} from '../api/client';
import { SAMPLE_CHAT_VOTES } from '@raidrelay/fixtures';
import {
  PlayCircle,
  RotateCcw,
  FastForward,
  CheckCircle2,
  Tv,
  MessageSquare,
} from 'lucide-react';

export const DemoLabPage: React.FC = () => {
  const { data: capData } = useQuery({
    queryKey: ['demo-capability'],
    queryFn: fetchDemoCapability,
  });

  const demoChannelKey = capData?.channelKey || '';

  const { data: ritualData } = useQuery({
    queryKey: ['demo-ritual'],
    queryFn: fetchDemoRitual,
    refetchInterval: 300,
  });

  const ritual = ritualData?.ritual;
  const isRitualActive = ritualData?.active && ritual && ritual.state !== 'IDLE';

  const queryClient = useQueryClient();

  const handleStartSim = async (multiplier: number) => {
    await runDemo(multiplier);
    queryClient.invalidateQueries({ queryKey: ['demo-ritual'] });
  };

  const handleReset = async () => {
    await resetDemo();
    queryClient.invalidateQueries({ queryKey: ['demo-ritual'] });
  };

  const handleApprove = async (id: string) => {
    await approveDemoRitual(id);
    queryClient.invalidateQueries({ queryKey: ['demo-ritual'] });
  };

  const handleOverride = async (id: string, choice: 'A' | 'B') => {
    await overrideDemoRitual(id, choice);
    queryClient.invalidateQueries({ queryKey: ['demo-ritual'] });
  };

  const handleSkip = async (id: string) => {
    await skipDemoRitual(id);
    queryClient.invalidateQueries({ queryKey: ['demo-ritual'] });
  };

  const handleClear = async () => {
    await clearDemoRitual();
    queryClient.invalidateQueries({ queryKey: ['demo-ritual'] });
  };

  const votesA = ritual?.votesA || 0;
  const votesB = ritual?.votesB || 0;
  const totalVotes = votesA + votesB;
  const percentA = totalVotes > 0 ? Math.round((votesA / totalVotes) * 100) : 50;
  const percentB = totalVotes > 0 ? 100 - percentA : 50;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6 font-mono">
      {/* Top Warning Banner: Simulation Mode Truthfulness */}
      <div className="p-4 rounded-xl bg-relay-amber/10 border-2 border-relay-amber/40 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-3.5 h-3.5 rounded-full bg-relay-amber animate-pulse shadow-amber-glow" />
          <div>
            <span
              data-testid="lab-simulated-banner"
              className="font-bold text-relay-amber text-xs uppercase tracking-wider block"
            >
              SIMULATED EVENT FEED — NOT TWITCH LIVE
            </span>
            <span className="text-[11px] text-chalk-300 block">
              This interactive rehearsal uses the production domain state machine with deterministic simulated raid & chat fixtures.
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            data-testid="run-sim-normal-btn"
            onClick={() => handleStartSim(1)}
            className="px-4 py-2 rounded bg-relay-amber hover:bg-relay-amber/90 text-charcoal-950 font-bold text-xs transition-colors flex items-center gap-1.5 shadow-amber-glow"
          >
            <PlayCircle className="w-4 h-4" />
            <span>Run 90s Raid Ritual</span>
          </button>

          <button
            type="button"
            data-testid="run-sim-fast-btn"
            onClick={() => handleStartSim(10)}
            className="px-3.5 py-2 rounded bg-charcoal-800 hover:bg-charcoal-700 border border-charcoal-600 text-chalk-200 text-xs font-semibold transition-colors flex items-center gap-1.5"
          >
            <FastForward className="w-3.5 h-3.5 text-relay-cyan" />
            <span>10x Speed</span>
          </button>

          <button
            type="button"
            data-testid="reset-sim-btn"
            aria-label="Reset simulation to idle"
            onClick={handleReset}
            className="px-3 py-2 rounded bg-charcoal-800 hover:bg-charcoal-700 border border-charcoal-600 text-chalk-400 hover:text-white text-xs transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
            <span className="sr-only">Reset simulation to idle</span>
          </button>
        </div>
      </div>

      {/* Split Screen Layout: Console Controls (Left) and 1080p Overlay Preview (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Broadcaster Actions & Active Status */}
        <div className="lg:col-span-5 space-y-6">
          <div className="p-5 rounded-xl bg-charcoal-800 border border-charcoal-700 space-y-5">
            <div className="flex items-center justify-between border-b border-charcoal-700 pb-3">
              <span className="text-xs font-bold text-white uppercase tracking-wider">Streamer Flight Controls</span>
              <span
                data-testid="lab-state-badge"
                className="px-2 py-0.5 rounded bg-charcoal-900 text-relay-amber border border-relay-amber/30 text-xs font-bold"
              >
                {isRitualActive ? ritual?.state : 'IDLE'}
              </span>
            </div>

            {isRitualActive && ritual ? (
              <div className="space-y-4 text-xs">
                {/* Metric Summary */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-2.5 bg-charcoal-900 rounded border border-charcoal-700">
                    <span className="text-[10px] text-chalk-400 block uppercase">Raider</span>
                    <span className="text-sm font-bold text-white">{ritual.raiderDisplayName}</span>
                  </div>
                  <div className="p-2.5 bg-charcoal-900 rounded border border-charcoal-700">
                    <span className="text-[10px] text-chalk-400 block uppercase">Incoming Party</span>
                    <span className="text-sm font-bold text-relay-amber">+{ritual.viewerCount} Viewers</span>
                  </div>
                </div>

                {/* Vote Counters */}
                <div className="p-3 bg-charcoal-900 rounded border border-charcoal-700 space-y-2">
                  <div className="flex justify-between text-[11px]">
                    <span className="text-relay-amber font-bold">Option A: {votesA} votes ({percentA}%)</span>
                    <span className="text-relay-cyan font-bold">Option B: {votesB} votes ({percentB}%)</span>
                  </div>
                  <div className="w-full h-2 bg-charcoal-800 rounded-full overflow-hidden flex">
                    <div className="bg-relay-amber transition-all duration-300" style={{ width: `${percentA}%` }} />
                    <div className="bg-relay-cyan transition-all duration-300" style={{ width: `${percentB}%` }} />
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="space-y-2 pt-1">
                  <button
                    type="button"
                    onClick={() => handleApprove(ritual.id)}
                    disabled={ritual.state !== 'AWAITING_STREAMER'}
                    className="w-full py-2.5 rounded bg-relay-emerald hover:bg-relay-emerald/90 text-charcoal-950 font-bold text-xs transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-emerald-glow"
                  >
                    Approve Majority Decision
                  </button>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => handleOverride(ritual.id, 'A')}
                      disabled={ritual.state !== 'VOTING' && ritual.state !== 'AWAITING_STREAMER'}
                      className="py-2 rounded bg-charcoal-700 hover:bg-charcoal-600 border border-charcoal-600 text-relay-amber font-semibold text-xs disabled:opacity-40"
                    >
                      Override: Option A
                    </button>
                    <button
                      type="button"
                      onClick={() => handleOverride(ritual.id, 'B')}
                      disabled={ritual.state !== 'VOTING' && ritual.state !== 'AWAITING_STREAMER'}
                      className="py-2 rounded bg-charcoal-700 hover:bg-charcoal-600 border border-charcoal-600 text-relay-cyan font-semibold text-xs disabled:opacity-40"
                    >
                      Override: Option B
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => handleSkip(ritual.id)}
                      className="py-1.5 rounded bg-charcoal-700 hover:bg-charcoal-600 text-chalk-300 text-xs"
                    >
                      Skip Ritual
                    </button>
                    <button
                      type="button"
                      onClick={handleClear}
                      className="py-1.5 rounded bg-relay-ruby/10 hover:bg-relay-ruby/20 border border-relay-ruby/40 text-relay-ruby text-xs font-semibold"
                    >
                      Panic Clear
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="py-12 text-center text-chalk-400 text-xs space-y-3">
                <p>No active ritual in progress.</p>
                <button
                  type="button"
                  onClick={() => handleStartSim(1)}
                  className="px-4 py-2 rounded bg-relay-amber text-charcoal-950 font-bold text-xs"
                >
                  Start Simulation
                </button>
              </div>
            )}
          </div>

          {/* Synthetic Chat Feed */}
          <div className="p-5 rounded-xl bg-charcoal-800 border border-charcoal-700 space-y-3 text-xs">
            <div className="flex items-center justify-between border-b border-charcoal-700 pb-2">
              <span className="font-bold text-white flex items-center gap-1.5">
                <MessageSquare className="w-3.5 h-3.5 text-relay-cyan" />
                <span>Simulated Chat Driver</span>
              </span>
              <span className="text-[10px] text-chalk-400 font-mono">1 Person = 1 Vote</span>
            </div>

            <div
              tabIndex={0}
              role="region"
              aria-label="Simulated incoming chat votes log"
              className="space-y-1.5 max-h-48 overflow-y-auto pr-1 focus:outline-none focus:ring-1 focus:ring-relay-amber/50 rounded"
            >
              {SAMPLE_CHAT_VOTES.map((chat, idx) => (
                <div key={idx} className="p-2 rounded bg-charcoal-900 border border-charcoal-800 flex items-center justify-between text-[11px]">
                  <span className="text-chalk-300 font-bold">{chat.name}:</span>
                  <code className="text-white bg-charcoal-800 px-1.5 py-0.5 rounded">{chat.messageText}</code>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: OBS Overlay 1080p Live Frame Preview */}
        <div className="lg:col-span-7 space-y-4">
          <div className="p-5 rounded-xl bg-charcoal-800 border border-charcoal-700 space-y-4">
            <div className="flex items-center justify-between border-b border-charcoal-700 pb-3">
              <span className="text-xs font-bold text-white flex items-center gap-2">
                <Tv className="w-4 h-4 text-relay-emerald" />
                <span>OBS Browser Overlay Preview (1920×1080 Aspect)</span>
              </span>
              {demoChannelKey && (
                <a
                  href={`/overlay/${demoChannelKey}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[11px] text-relay-cyan hover:underline"
                >
                  Open Clean Window ↗
                </a>
              )}
            </div>

            {/* Embedded Live Overlay Iframe */}
            <div className="w-full aspect-video bg-charcoal-950 rounded-lg border-2 border-charcoal-700 overflow-hidden relative shadow-broadcast">
              {demoChannelKey ? (
                <iframe
                  title="RaidRelay Live OBS Overlay"
                  src={`/overlay/${demoChannelKey}`}
                  className="w-full h-full border-0 pointer-events-none"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-chalk-400 text-xs">
                  Loading overlay capability...
                </div>
              )}
            </div>

            <div className="p-3 rounded bg-charcoal-900 border border-charcoal-700 text-[11px] text-chalk-400 space-y-1">
              <div className="flex items-center gap-1.5 text-chalk-200 font-bold">
                <CheckCircle2 className="w-3.5 h-3.5 text-relay-emerald" />
                <span>OBS Browser Source Configuration:</span>
              </div>
              <p>Width: 1920 • Height: 1080 • Custom CSS: <code>body &#123; background: transparent; &#125;</code></p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
