import Constants from 'expo-constants';

const extra = Constants.expoConfig?.extra as { apiUrl?: string } | undefined;

function resolveApiBaseUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL || extra?.apiUrl;
  if (fromEnv) return fromEnv.replace(/\/$/, '');
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    return 'http://localhost:3001';
  }
  throw new Error('EXPO_PUBLIC_API_URL must be set for production builds');
}

export const API_BASE_URL = resolveApiBaseUrl();

export interface CreateScanResponse {
  scanId: string;
  status: string;
}

export interface ScanStatusResponse {
  scanId: string;
  status: string;
  statusReason?: string;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((body as { error?: string }).error || `Request failed (${res.status})`);
  }
  return body as T;
}

export const api = {
  createScan: (url: string, options: Record<string, unknown>) =>
    request<CreateScanResponse>('/api/scans', {
      method: 'POST',
      body: JSON.stringify({ url, options }),
    }),

  getStatus: (id: string) => request<ScanStatusResponse>(`/api/scans/${id}/status`),

  getResults: (id: string) => request<Record<string, unknown>>(`/api/scans/${id}/results`),

  listScans: () => request<Array<Record<string, unknown>>>('/api/scans'),

  cancelScan: (id: string) =>
    request<{ success: boolean }>(`/api/scans/${id}/cancel`, { method: 'POST' }),

  getScan: (id: string) => request<Record<string, unknown>>(`/api/scans/${id}`),

  getFindings: (id: string, query?: { severity?: string; category?: string; page?: string }) => {
    const q = new URLSearchParams();
    if (query?.severity) q.set('severity', query.severity);
    if (query?.category) q.set('category', query.category);
    if (query?.page) q.set('page', query.page);
    const suffix = q.toString() ? `?${q.toString()}` : '';
    return request<Record<string, unknown>>(`/api/scans/${id}/findings${suffix}`);
  },
};
