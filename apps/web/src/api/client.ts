import type {
  BroadcasterConfig,
  PublicBroadcasterConfig,
  UpdateBroadcasterConfigInput,
  RitualSnapshot,
  HealthStatus,
  VoteChoice,
} from '@raidrelay/contracts';

const API_BASE = '/api';

export async function fetchHealth(): Promise<HealthStatus> {
  const res = await fetch(`${API_BASE}/health`);
  if (!res.ok) throw new Error('Health check failed');
  return res.json();
}

export async function fetchMeta(): Promise<{
  project: string;
  tagline: string;
  thesis: string;
  codexSessionId: string;
  evidenceModes: Record<string, string>;
}> {
  const res = await fetch(`${API_BASE}/meta`);
  if (!res.ok) throw new Error('Meta query failed');
  return res.json();
}

export async function fetchAuthSession(): Promise<{
  authenticated: boolean;
  broadcaster: { id: string; login: string; displayName: string } | null;
  twitchConnected: boolean;
  eventSubStatus: string;
}> {
  const res = await fetch(`${API_BASE}/auth/session`, { credentials: 'include' });
  if (!res.ok) throw new Error('Failed to query session');
  return res.json();
}

// Public configuration (channelKey omitted)
export async function fetchConfig(): Promise<PublicBroadcasterConfig> {
  const res = await fetch(`${API_BASE}/config`, { credentials: 'include' });
  if (!res.ok) throw new Error('Failed to fetch broadcaster configuration');
  return res.json();
}

// Private authenticated configuration (includes channelKey)
export async function fetchPrivateConfig(): Promise<BroadcasterConfig> {
  const res = await fetch(`${API_BASE}/config/private`, { credentials: 'include' });
  if (!res.ok) throw new Error('Failed to fetch private broadcaster configuration');
  return res.json();
}

// Authenticated overlay capability retrieval
export async function fetchOverlayCapability(): Promise<{ success: boolean; channelKey: string }> {
  const res = await fetch(`${API_BASE}/overlay-capability`, { credentials: 'include' });
  if (!res.ok) throw new Error('Failed to fetch overlay capability');
  return res.json();
}

// Update Broadcaster Configuration (Requires authenticated session)
export async function updateConfig(input: UpdateBroadcasterConfigInput): Promise<BroadcasterConfig> {
  const res = await fetch(`${API_BASE}/config`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error('Failed to update broadcaster configuration');
  return res.json();
}

// Rotate Capability Key (Requires authenticated session)
export async function rotateChannelKey(): Promise<{ success: boolean; channelKey: string }> {
  const res = await fetch(`${API_BASE}/config/rotate-key`, {
    method: 'POST',
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to rotate channel capability key');
  return res.json();
}

// --- Live Ritual Operations (Requires authenticated session) ---
export async function fetchCurrentRitual(): Promise<{ active: boolean; ritual: RitualSnapshot | null }> {
  const res = await fetch(`${API_BASE}/ritual/current`, { credentials: 'include' });
  if (!res.ok) throw new Error('Failed to fetch current ritual');
  return res.json();
}

export async function approveRitual(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/ritual/${id}/approve`, {
    method: 'POST',
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to approve ritual');
}

export async function overrideRitual(id: string, choice: VoteChoice): Promise<void> {
  const res = await fetch(`${API_BASE}/ritual/${id}/override`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify({ overrideChoice: choice }),
  });
  if (!res.ok) throw new Error('Failed to override ritual');
}

export async function skipRitual(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/ritual/${id}/skip`, {
    method: 'POST',
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to skip ritual');
}

export async function clearRitual(): Promise<void> {
  const res = await fetch(`${API_BASE}/ritual/clear`, {
    method: 'POST',
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to clear ritual');
}

// --- Dedicated Demo Lab Endpoints (/api/demo/*) ---
export async function fetchDemoCapability(): Promise<{ success: boolean; channelKey: string }> {
  const res = await fetch(`${API_BASE}/demo/capability`);
  if (!res.ok) throw new Error('Failed to fetch demo capability');
  return res.json();
}

export async function fetchDemoRitual(): Promise<{ active: boolean; ritual: RitualSnapshot | null }> {
  const res = await fetch(`${API_BASE}/demo/ritual/current`);
  if (!res.ok) throw new Error('Failed to fetch demo ritual');
  return res.json();
}

export async function runDemo(speedMultiplier = 1): Promise<void> {
  const res = await fetch(`${API_BASE}/demo/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ speedMultiplier }),
  });
  if (!res.ok) throw new Error('Failed to run demo simulation');
}

export async function resetDemo(): Promise<void> {
  const res = await fetch(`${API_BASE}/demo/reset`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error('Failed to reset demo lab');
}

export async function approveDemoRitual(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/demo/ritual/${id}/approve`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error('Failed to approve demo ritual');
}

export async function overrideDemoRitual(id: string, choice: VoteChoice): Promise<void> {
  const res = await fetch(`${API_BASE}/demo/ritual/${id}/override`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ overrideChoice: choice }),
  });
  if (!res.ok) throw new Error('Failed to override demo ritual');
}

export async function skipDemoRitual(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/demo/ritual/${id}/skip`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error('Failed to skip demo ritual');
}

export async function clearDemoRitual(): Promise<void> {
  const res = await fetch(`${API_BASE}/demo/ritual/clear`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error('Failed to clear demo ritual');
}

// --- Sensitive Account Operations (Requires authenticated session) ---
export async function deleteLocalData(): Promise<void> {
  const res = await fetch(`${API_BASE}/data/delete-local`, {
    method: 'POST',
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to delete local data');
}

export async function disconnectAuth(): Promise<void> {
  const res = await fetch(`${API_BASE}/auth/disconnect`, {
    method: 'POST',
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to disconnect');
}
