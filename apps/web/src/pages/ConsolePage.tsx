import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchConfig,
  updateConfig,
  fetchCurrentRitual,
  approveRitual,
  overrideRitual,
  skipRitual,
  clearRitual,
  runDemo,
} from '../api/client';
import {
  Sliders,
  Check,
  Copy,
  Play,
  ShieldAlert,
  CheckCircle,
} from 'lucide-react';

export const ConsolePage: React.FC = () => {
  const queryClient = useQueryClient();
  const [copiedOverlayUrl, setCopiedOverlayUrl] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Form State
  const [activity, setActivity] = useState('');
  const [goal, setGoal] = useState('');
  const [communityNorm, setCommunityNorm] = useState('');
  const [optionA, setOptionA] = useState('');
  const [optionB, setOptionB] = useState('');
  const [autoApprove, setAutoApprove] = useState(false);

  // Config Query
  const { data: config } = useQuery({
    queryKey: ['config'],
    queryFn: fetchConfig,
  });

  useEffect(() => {
    if (config) {
      setActivity(config.activity);
      setGoal(config.goal);
      setCommunityNorm(config.communityNorm);
      setOptionA(config.optionA);
      setOptionB(config.optionB);
      setAutoApprove(config.autoApprove);
    }
  }, [config]);

  // Real-time Ritual Query (Polls every 500ms as fallback + WebSocket)
  const { data: ritualData } = useQuery({
    queryKey: ['current-ritual'],
    queryFn: fetchCurrentRitual,
    refetchInterval: 500,
  });

  const ritual = ritualData?.ritual;
  const isRitualActive = ritualData?.active && ritual && ritual.state !== 'IDLE';

  // Config Mutation
  const updateConfigMutation = useMutation({
    mutationFn: updateConfig,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['config'] });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
    },
  });

  const handleSaveConfig = (e: React.FormEvent) => {
    e.preventDefault();
    updateConfigMutation.mutate({
      activity,
      goal,
      communityNorm,
      optionA,
      optionB,
      autoApprove,
    });
  };

  const handleCopyOverlay = () => {
    const channelKey = config?.channelKey || 'demo-channel-key-12345';
    const overlayUrl = `${window.location.origin}/overlay/${channelKey}`;
    navigator.clipboard.writeText(overlayUrl);
    setCopiedOverlayUrl(true);
    setTimeout(() => setCopiedOverlayUrl(false), 2000);
  };

  // Vote calculations
  const votesA = ritual?.votesA || 0;
  const votesB = ritual?.votesB || 0;
  const totalVotes = votesA + votesB;
  const percentA = totalVotes > 0 ? Math.round((votesA / totalVotes) * 100) : 50;
  const percentB = totalVotes > 0 ? 100 - percentA : 50;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-charcoal-700 pb-5">
        <div>
          <h1 className="text-2xl font-bold font-mono text-white flex items-center gap-2">
            <Sliders className="w-6 h-6 text-relay-amber" />
            <span>Broadcaster Control Workspace</span>
          </h1>
          <p className="text-xs text-chalk-400 font-mono mt-1">
            Configure destination stream context, pre-approved choices, and control active raid handoffs.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleCopyOverlay}
            className="px-3.5 py-2 rounded bg-charcoal-800 hover:bg-charcoal-700 border border-charcoal-600 text-xs font-mono text-chalk-200 hover:text-white flex items-center gap-1.5 transition-colors"
          >
            {copiedOverlayUrl ? <Check className="w-3.5 h-3.5 text-relay-emerald" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copiedOverlayUrl ? 'Overlay URL Copied!' : 'Copy OBS Overlay URL'}</span>
          </button>

          <button
            type="button"
            onClick={() => runDemo(1)}
            className="px-3.5 py-2 rounded bg-relay-amber/10 hover:bg-relay-amber/20 border border-relay-amber/40 text-xs font-mono text-relay-amber font-semibold flex items-center gap-1.5 transition-colors"
          >
            <Play className="w-3.5 h-3.5" />
            <span>Rehearse in Demo Lab</span>
          </button>
        </div>
      </div>

      {/* Live Ritual Monitoring & Control Panel */}
      <div className="rounded-xl bg-charcoal-800 border border-charcoal-700 p-6 space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-charcoal-700 pb-4">
          <div className="flex items-center gap-3">
            <div
              className={`w-3.5 h-3.5 rounded-full ${
                isRitualActive ? 'bg-relay-emerald animate-pulse shadow-emerald-glow' : 'bg-charcoal-600'
              }`}
            />
            <div>
              <span className="text-xs font-mono text-chalk-400 uppercase tracking-widest block">Active Ritual State</span>
              <span className="text-lg font-bold font-mono text-white">
                {isRitualActive ? ritual?.state : 'IDLE — Awaiting Incoming Raid'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {isRitualActive && (
              <span
                data-testid="console-source-badge"
                className={`px-2.5 py-1 rounded text-xs font-mono font-semibold border ${
                  ritual.sourceMode === 'LIVE_TWITCH'
                    ? 'bg-relay-emerald/10 text-relay-emerald border-relay-emerald/30 shadow-emerald-glow'
                    : 'bg-relay-amber/10 text-relay-amber border-relay-amber/30'
                }`}
              >
                {ritual.sourceMode}
              </span>
            )}

            <button
              type="button"
              onClick={() => clearRitual()}
              disabled={!isRitualActive}
              className="px-3 py-1.5 rounded bg-relay-ruby/10 hover:bg-relay-ruby/20 border border-relay-ruby/40 text-xs font-mono text-relay-ruby font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ShieldAlert className="w-3.5 h-3.5" />
              <span>Panic Clear Overlay</span>
            </button>
          </div>
        </div>

        {/* Active Ritual Metrics & Streamer Controls */}
        {isRitualActive && ritual ? (
          <div className="space-y-6">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="p-3.5 bg-charcoal-900 rounded border border-charcoal-700 space-y-1">
                <span className="text-[11px] font-mono text-chalk-400 block">Raider</span>
                <span className="text-base font-bold text-white font-mono">{ritual.raiderDisplayName}</span>
              </div>
              <div className="p-3.5 bg-charcoal-900 rounded border border-charcoal-700 space-y-1">
                <span className="text-[11px] font-mono text-chalk-400 block">Viewers Arriving</span>
                <span className="text-base font-bold text-relay-amber font-mono">+{ritual.viewerCount}</span>
              </div>
              <div className="p-3.5 bg-charcoal-900 rounded border border-charcoal-700 space-y-1">
                <span className="text-[11px] font-mono text-chalk-400 block">Unique Votes</span>
                <span className="text-base font-bold text-relay-cyan font-mono">{totalVotes}</span>
              </div>
              <div className="p-3.5 bg-charcoal-900 rounded border border-charcoal-700 space-y-1">
                <span className="text-[11px] font-mono text-chalk-400 block">Time Remaining</span>
                <span className="text-base font-bold text-white font-mono">
                  {Math.ceil(ritual.timeRemainingMs / 1000)}s
                </span>
              </div>
            </div>

            {/* Voting Visual Progress Bar */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-mono text-chalk-200">
                <span className="text-relay-amber font-bold">
                  Option A ({votesA} votes • {percentA}%): {ritual.optionA}
                </span>
                <span className="text-relay-cyan font-bold">
                  Option B ({votesB} votes • {percentB}%): {ritual.optionB}
                </span>
              </div>

              <div className="w-full h-3 bg-charcoal-900 rounded-full overflow-hidden flex border border-charcoal-700">
                <div
                  className="bg-relay-amber transition-all duration-300"
                  style={{ width: `${percentA}%` }}
                />
                <div
                  className="bg-relay-cyan transition-all duration-300"
                  style={{ width: `${percentB}%` }}
                />
              </div>
            </div>

            {/* Streamer Approval / Override Controls */}
            <div className="flex flex-wrap items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => approveRitual(ritual.id)}
                disabled={ritual.state !== 'AWAITING_STREAMER'}
                className="px-4 py-2 rounded bg-relay-emerald hover:bg-relay-emerald/90 text-charcoal-950 font-bold font-mono text-xs transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-emerald-glow"
              >
                Approve Majority Decision
              </button>

              <button
                type="button"
                onClick={() => overrideRitual(ritual.id, 'A')}
                disabled={ritual.state !== 'VOTING' && ritual.state !== 'AWAITING_STREAMER'}
                className="px-3.5 py-2 rounded bg-charcoal-700 hover:bg-charcoal-600 border border-charcoal-600 text-relay-amber font-mono text-xs transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Force Option A
              </button>

              <button
                type="button"
                onClick={() => overrideRitual(ritual.id, 'B')}
                disabled={ritual.state !== 'VOTING' && ritual.state !== 'AWAITING_STREAMER'}
                className="px-3.5 py-2 rounded bg-charcoal-700 hover:bg-charcoal-600 border border-charcoal-600 text-relay-cyan font-mono text-xs transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Force Option B
              </button>

              <button
                type="button"
                onClick={() => skipRitual(ritual.id)}
                className="px-3.5 py-2 rounded bg-charcoal-700 hover:bg-charcoal-600 border border-charcoal-600 text-chalk-300 font-mono text-xs transition-colors"
              >
                Skip Ritual
              </button>
            </div>
          </div>
        ) : (
          <div className="py-8 text-center space-y-2 text-chalk-400 font-mono text-xs">
            <p>Ready for incoming raids. Inbound events will trigger the ritual state machine automatically.</p>
            <p className="text-[11px] text-chalk-400">
              To test the full sequence right now, click <strong>"Rehearse in Demo Lab"</strong> above.
            </p>
          </div>
        )}
      </div>

      {/* Broadcaster Now Card & Pre-Approved Options Form */}
      <div className="rounded-xl bg-charcoal-800 border border-charcoal-700 p-6 space-y-6">
        <div className="border-b border-charcoal-700 pb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold font-mono text-white flex items-center gap-2">
            <span>Destination Stream Context ("Now Card")</span>
          </h2>
          {saveSuccess && (
            <span className="text-xs font-mono text-relay-emerald flex items-center gap-1">
              <CheckCircle className="w-3.5 h-3.5" />
              <span>Configuration saved!</span>
            </span>
          )}
        </div>

        <form onSubmit={handleSaveConfig} className="space-y-5 text-sm font-mono">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor="activity" className="text-xs text-chalk-200 font-semibold">
                Current Activity (Max 80 chars)
              </label>
              <span className="text-[11px] text-chalk-400">{activity.length}/80</span>
            </div>
            <input
              id="activity"
              type="text"
              maxLength={80}
              required
              value={activity}
              onChange={(e) => setActivity(e.target.value)}
              className="w-full px-3.5 py-2 rounded bg-charcoal-900 border border-charcoal-700 text-white focus:outline-none focus:border-relay-amber text-xs"
              placeholder="e.g. Building a tiny robot live"
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor="goal" className="text-xs text-chalk-200 font-semibold">
                Current Goal & Stakes (Max 100 chars)
              </label>
              <span className="text-[11px] text-chalk-400">{goal.length}/100</span>
            </div>
            <input
              id="goal"
              type="text"
              maxLength={100}
              required
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              className="w-full px-3.5 py-2 rounded bg-charcoal-900 border border-charcoal-700 text-white focus:outline-none focus:border-relay-amber text-xs"
              placeholder="e.g. Make it cross the finish line before the stream ends"
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor="norm" className="text-xs text-chalk-200 font-semibold">
                Community Norm (Max 100 chars)
              </label>
              <span className="text-[11px] text-chalk-400">{communityNorm.length}/100</span>
            </div>
            <input
              id="norm"
              type="text"
              maxLength={100}
              required
              value={communityNorm}
              onChange={(e) => setCommunityNorm(e.target.value)}
              className="w-full px-3.5 py-2 rounded bg-charcoal-900 border border-charcoal-700 text-white focus:outline-none focus:border-relay-amber text-xs"
              placeholder="e.g. Helpful chaos, no spoilers"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor="optionA" className="text-xs text-relay-amber font-semibold">
                  Option A Challenge (Max 80 chars)
                </label>
                <span className="text-[11px] text-chalk-400">{optionA.length}/80</span>
              </div>
              <input
                id="optionA"
                type="text"
                maxLength={80}
                required
                value={optionA}
                onChange={(e) => setOptionA(e.target.value)}
                className="w-full px-3.5 py-2 rounded bg-charcoal-900 border border-charcoal-700 text-white focus:outline-none focus:border-relay-amber text-xs"
                placeholder="e.g. Drive the next test with only the left sensor"
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor="optionB" className="text-xs text-relay-cyan font-semibold">
                  Option B Challenge (Max 80 chars)
                </label>
                <span className="text-[11px] text-chalk-400">{optionB.length}/80</span>
              </div>
              <input
                id="optionB"
                type="text"
                maxLength={80}
                required
                value={optionB}
                onChange={(e) => setOptionB(e.target.value)}
                className="w-full px-3.5 py-2 rounded bg-charcoal-900 border border-charcoal-700 text-white focus:outline-none focus:border-relay-cyan text-xs"
                placeholder="e.g. Give the robot a 20-second victory dance first"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 pt-2">
            <input
              id="autoApprove"
              type="checkbox"
              checked={autoApprove}
              onChange={(e) => setAutoApprove(e.target.checked)}
              className="w-4 h-4 rounded bg-charcoal-900 border-charcoal-700 text-relay-emerald focus:ring-0"
            />
            <label htmlFor="autoApprove" className="text-xs text-chalk-300 font-mono">
              Auto-approve voting winner directly without pausing in Awaiting Streamer state
            </label>
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={updateConfigMutation.isPending}
              className="px-5 py-2.5 rounded bg-charcoal-700 hover:bg-charcoal-600 border border-charcoal-600 text-white font-bold font-mono text-xs transition-colors flex items-center gap-2"
            >
              <span>{updateConfigMutation.isPending ? 'Saving...' : 'Save Configuration'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
