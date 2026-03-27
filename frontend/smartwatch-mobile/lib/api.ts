/**
 * API client - all calls include JWT from SecureStore.
 * Poll /api/vitals/latest every 5 seconds from dashboard.
 */
const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8080';

export async function apiFetch(
  path: string,
  options: RequestInit & { token?: string | null } = {}
): Promise<Response> {
  const { token, ...rest } = options;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(rest.headers as Record<string, string>),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return fetch(`${API_URL}${path}`, { ...rest, headers });
}

export async function register(name: string, email: string, password: string, dateOfBirth: string, gender?: string) {
  const res = await apiFetch('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ name, email, password, dateOfBirth, gender: gender || null }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Registration failed');
  }
  return res.json();
}

export async function login(email: string, password: string) {
  const res = await apiFetch('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Login failed');
  }
  return res.json();
}

export async function connectDevice(token: string | null) {
  const res = await apiFetch('/api/device/connect', { method: 'POST', token });
  if (!res.ok) throw new Error('Failed to connect device');
  return res.json();
}

export async function disconnectDevice(token: string | null) {
  const res = await apiFetch('/api/device/disconnect', { method: 'POST', token });
  if (!res.ok) throw new Error('Failed to disconnect device');
  return res.json();
}

export async function getDeviceStatus(token: string | null) {
  const res = await apiFetch('/api/device/status', { token });
  if (!res.ok) throw new Error('Failed to get status');
  return res.json();
}

export async function getVitalsLatest(token: string | null) {
  const res = await apiFetch('/api/vitals/latest', { token });
  if (!res.ok) throw new Error('Failed to get vitals');
  return res.json();
}

export async function getVitalsHistory(token: string | null, limit = 20) {
  const res = await apiFetch(`/api/vitals/history?limit=${limit}`, { token });
  if (!res.ok) throw new Error('Failed to get history');
  return res.json();
}

export async function getAlerts(token: string | null) {
  const res = await apiFetch('/api/alerts', { token });
  if (!res.ok) throw new Error('Failed to get alerts');
  return res.json();
}

export async function getPreferences(token: string | null) {
  const res = await apiFetch('/api/preferences', { token });
  if (!res.ok) throw new Error('Failed to get preferences');
  return res.json();
}

export async function updatePreferences(
  token: string | null,
  enableHeartRateAlerts?: boolean,
  enableGeneralAlerts?: boolean
) {
  const res = await apiFetch('/api/preferences', {
    method: 'PUT',
    token,
    body: JSON.stringify({
      enableHeartRateAlerts: enableHeartRateAlerts ?? undefined,
      enableGeneralAlerts: enableGeneralAlerts ?? undefined,
    }),
  });
  if (!res.ok) throw new Error('Failed to update preferences');
  return res.json();
}

export async function getVitalsRange(token: string | null, from: string, to: string) {
  const res = await apiFetch(`/api/vitals?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, { token });
  if (!res.ok) throw new Error('Failed to get vitals range');
  return res.json();
}

export async function getVitalsAggregate(token: string | null, type: 'hourly' | 'daily') {
  const res = await apiFetch(`/api/vitals/aggregate?type=${type}`, { token });
  if (!res.ok) throw new Error('Failed to get vitals aggregate');
  return res.json();
}

export async function getAlertStats(token: string | null, range = '7d') {
  const res = await apiFetch(`/api/alerts/stats?range=${range}`, { token });
  if (!res.ok) throw new Error('Failed to get alert stats');
  return res.json();
}

export async function getInsights(token: string | null) {
  const res = await apiFetch('/api/insights/summary', { token });
  if (!res.ok) throw new Error('Failed to get insights');
  return res.json();
}

export async function getVitalsTrends(token: string | null, range = 'weekly') {
  const res = await apiFetch(`/api/vitals/trends?range=${range}`, { token });
  if (!res.ok) throw new Error('Failed to get vitals trends');
  return res.json();
}

export async function getLatestSleep(token: string | null) {
  const res = await apiFetch('/api/vitals/sleep/latest', { token });
  if (!res.ok) throw new Error('Failed to get latest sleep');
  if (res.status === 204) return null;
  return res.json();
}

