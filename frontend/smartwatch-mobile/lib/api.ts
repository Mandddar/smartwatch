/**
 * API client - all calls include JWT from SecureStore.
 * Poll /api/vitals/latest every 5 seconds from dashboard.
 */
const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8080';

let onAuthExpired: (() => void) | null = null;

/** Register a callback that fires when the backend returns 401/403 (expired token) */
export function setOnAuthExpired(cb: () => void) {
  onAuthExpired = cb;
}

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
  const res = await fetch(`${API_URL}${path}`, { ...rest, headers });

  // Auto-logout on expired/invalid token (skip auth endpoints)
  if ((res.status === 401 || res.status === 403) && token && !path.startsWith('/api/auth')) {
    onAuthExpired?.();
  }

  return res;
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

/** Batch upload vitals to backend (sync) */
export async function uploadVitalsBatch(
  token: string | null,
  readings: { heartRate: number; spo2: number; steps: number; timestamp: string }[]
) {
  const res = await apiFetch('/api/vitals/batch', {
    method: 'POST',
    token,
    body: JSON.stringify({ readings }),
  });
  if (!res.ok) throw new Error('Batch upload failed');
  return res.json() as Promise<{ received: number; syncId: string }>;
}

/** Get daily health report */
export async function getDailyReport(token: string | null, date?: string) {
  const query = date ? `?date=${date}` : '';
  const res = await apiFetch(`/api/reports/daily${query}`, { token });
  if (!res.ok) throw new Error('Failed to get daily report');
  return res.json();
}

/** Get summary report (12h, 24h, 48h) */
export async function getSummaryReport(token: string | null, range: '12h' | '24h' | '48h' = '12h') {
  const res = await apiFetch(`/api/reports/summary?range=${range}`, { token });
  if (!res.ok) throw new Error('Failed to get summary report');
  return res.json();
}

/** Get personal baselines */
export async function getBaselines(token: string | null) {
  const res = await apiFetch('/api/baselines', { token });
  if (!res.ok) throw new Error('Failed to get baselines');
  return res.json();
}

/** Get baseline personalization status */
export async function getBaselineStatus(token: string | null) {
  const res = await apiFetch('/api/baselines/status', { token });
  if (!res.ok) throw new Error('Failed to get baseline status');
  return res.json();
}

// ─── Alert Management ───

export async function getUnreadAlertCount(token: string | null): Promise<number> {
  const res = await apiFetch('/api/alerts/unread-count', { token });
  if (!res.ok) return 0;
  const data = await res.json();
  return data.count ?? 0;
}

export async function markAlertAsRead(token: string | null, alertId: number) {
  const res = await apiFetch(`/api/alerts/${alertId}/read`, { method: 'PATCH', token });
  if (!res.ok) throw new Error('Failed to mark alert as read');
  return res.json();
}

export async function markAllAlertsRead(token: string | null) {
  const res = await apiFetch('/api/alerts/mark-all-read', { method: 'POST', token });
  if (!res.ok) throw new Error('Failed to mark all alerts as read');
}

export async function deleteAlert(token: string | null, alertId: number) {
  const res = await apiFetch(`/api/alerts/${alertId}`, { method: 'DELETE', token });
  if (!res.ok) throw new Error('Failed to delete alert');
}

// ─── Profile Management ───

export async function getProfile(token: string | null) {
  const res = await apiFetch('/api/profile', { token });
  if (!res.ok) throw new Error('Failed to get profile');
  return res.json();
}

export async function updateProfile(token: string | null, data: { name?: string; gender?: string; dateOfBirth?: string }) {
  const res = await apiFetch('/api/profile', { method: 'PUT', token, body: JSON.stringify(data) });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to update profile');
  }
  return res.json();
}

export async function changePassword(token: string | null, currentPassword: string, newPassword: string) {
  const res = await apiFetch('/api/profile/change-password', {
    method: 'POST', token,
    body: JSON.stringify({ currentPassword, newPassword }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to change password');
  }
  return res.json();
}

export async function deleteAccount(token: string | null, password: string) {
  const res = await apiFetch('/api/profile', {
    method: 'DELETE', token,
    body: JSON.stringify({ password }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to delete account');
  }
}

export async function resetPassword(email: string, dateOfBirth: string, newPassword: string) {
  const res = await apiFetch('/api/profile/reset-password', {
    method: 'POST',
    body: JSON.stringify({ email, dateOfBirth, newPassword }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Password reset failed');
  }
  return res.json();
}

