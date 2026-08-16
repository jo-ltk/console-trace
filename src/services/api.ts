import Constants from 'expo-constants';

const extra = Constants.expoConfig?.extra as { apiUrl?: string } | undefined;

/** Public TRACE API. Never put DATABASE_URL / REDIS_URL here. */
export const PRODUCTION_API_URL = 'https://trace-api-15uf.onrender.com';

function resolveApiBaseUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL || extra?.apiUrl || PRODUCTION_API_URL;
  return fromEnv.replace(/\/$/, '');
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
