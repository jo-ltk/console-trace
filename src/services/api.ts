import { Platform } from 'react-native';
import Constants from 'expo-constants';

const extra = Constants.expoConfig?.extra as { apiUrl?: string } | undefined;

/** Public TRACE API. Never put DATABASE_URL / REDIS_URL here. */
export const PRODUCTION_API_URL = 'https://trace-api-15uf.onrender.com';

const REQUEST_TIMEOUT_MS = 20000;
const MAX_RETRIES = 3;

function resolveApiBaseUrl(): string {
  // Web uses same-origin API routes (EAS Hosting proxy) to avoid browser CORS limits.
  if (Platform.OS === 'web') {
    return '';
  }
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

function isRetryableStatus(status: number): boolean {
  return status === 502 || status === 503 || status === 504 || status === 429;
}

async function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const res = await fetchWithTimeout(`${API_BASE_URL}${path}`, {
        ...init,
        headers: {
          'Content-Type': 'application/json',
          ...(init?.headers ?? {}),
        },
      });

      const body = await res.json().catch(() => ({}));

      if (!res.ok) {
        const message = (body as { error?: string }).error || `Request failed (${res.status})`;
        if (isRetryableStatus(res.status) && attempt < MAX_RETRIES - 1) {
          await sleep(500 * 2 ** attempt);
          continue;
        }
        throw new Error(message);
      }

      return body as T;
    } catch (err) {
      lastError = err as Error;
      const retryable =
        lastError.name === 'AbortError' ||
        /502|503|504|429|network|fetch failed/i.test(lastError.message);
      if (retryable && attempt < MAX_RETRIES - 1) {
        await sleep(500 * 2 ** attempt);
        continue;
      }
      if (lastError.name === 'AbortError') {
        throw new Error('Request timed out');
      }
      throw lastError;
    }
  }

  throw lastError ?? new Error('Request failed');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

  /** SSE progress stream (web via proxy). Native clients use polling. */
  subscribeScanEvents(
    scanId: string,
    onEvent: (payload: { status: string; statusReason?: string }) => void,
    onError?: (err: Error) => void,
  ): () => void {
    if (Platform.OS !== 'web' || typeof EventSource === 'undefined') {
      return () => undefined;
    }

    const es = new EventSource(`/api/scans/${scanId}/events`);
    es.onmessage = (ev) => {
      try {
        onEvent(JSON.parse(ev.data) as { status: string; statusReason?: string });
      } catch {
        /* ignore malformed */
      }
    };
    es.onerror = () => {
      onError?.(new Error('Scan event stream disconnected'));
      es.close();
    };

    return () => es.close();
  },
};
