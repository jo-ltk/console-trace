export type ScanStatus = 'idle' | 'queued' | 'scanning' | 'completed' | 'failed' | 'cancelled';

export type ObservationType = 'log' | 'info' | 'warn' | 'error';

export interface ConsoleObservation {
  id: string;
  type: ObservationType;
  message: string;
  pageUrl: string;
  timestamp: string;
  source?: string;
  origin: 'TARGET' | 'SCANNER' | 'BROWSER';
  line?: number;
  column?: number;
}

export interface RuntimeIssue {
  id: string;
  message: string;
  pageUrl: string;
  stack?: string;
  timestamp: string;
  severity: 'critical' | 'warning';
}

export interface NetworkIssue {
  id: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  url: string;
  status: number;
  duration: number; // ms
  pageUrl: string;
  type: 'failed' | 'slow' | 'broken-asset' | 'ok';
  reason?: string;
  resourceType?: string;
}

export interface ScannerBlockedRequest {
  id: string;
  method: string;
  url: string;
  resourceType: string;
  reason: string;
  pageUrl: string;
  duration: number;
}

export interface PerformanceMetrics {
  lcp: number; // Largest Contentful Paint (s)
  fcp: number; // First Contentful Paint (s)
  cls: number; // Cumulative Layout Shift
  inp: number; // Interaction to Next Paint (ms)
  ttfb: number; // Time to First Byte (ms)
}

export interface PerformanceLabels {
  lcp: string;
  fcp: string;
  cls: string;
  inp: string;
  ttfb: string;
}

export interface AccessibilityIssue {
  id: string;
  impact: 'critical' | 'serious' | 'moderate' | 'minor';
  description: string;
  selector: string;
  pageUrl: string;
}

export interface PageResult {
  id: string;
  url: string;
  title: string;
  status: 'healthy' | 'warning' | 'error';
  statusCode?: number;
  issuesCount: number;
  duration: number;
}

export type FindingSeverity = 'CRITICAL' | 'ERROR' | 'WARNING' | 'INFO';
export type FindingCategory =
  | 'console'
  | 'runtime'
  | 'network'
  | 'assets'
  | 'performance'
  | 'accessibility'
  | 'security'
  | 'seo';

export interface ClientFinding {
  id: string;
  category: FindingCategory;
  severity: FindingSeverity;
  title: string;
  summary: string;
  description: string;
  evidenceText: string;
  evidence: Record<string, unknown>;
  pageUrl?: string;
  url?: string;
  occurrences: number;
  firstObservedAt: string;
  recommendation: string;
  whyItMatters: string;
  confidence: string;
  pages: string[];
}

export interface ScoreBreakdown {
  overall: number;
  runtime: number;
  network: number;
  console: number;
  performance: number;
  accessibility: number;
  security: number;
  seo: number;
  assets: number;
  explanations: Record<string, string[]>;
}

export interface FindingsSummaryClient {
  total: number;
  severity: { critical: number; error: number; warning: number; info: number };
}

export interface ScanResult {
  id: string;
  url: string;
  normalizedUrl: string;
  status: ScanStatus;
  startedAt: string;
  completedAt?: string;
  pagesScanned: number;
  totalPages: number;
  healthScore: number;
  previousScore?: number;
  scores?: ScoreBreakdown;
  findings: ClientFinding[];
  findingsSummary?: FindingsSummaryClient;
  summary: {
    consoleCount: number;
    runtimeCount: number;
    networkCount: number;
    scannerBlockedCount: number;
    assetsCount: number;
    performanceRating: string;
    accessibilityCount: number;
  };
  consoleObservations: ConsoleObservation[];
  runtimeIssues: RuntimeIssue[];
  networkIssues: NetworkIssue[];
  scannerBlockedRequests: ScannerBlockedRequest[];
  performanceMetrics: PerformanceMetrics;
  performanceLabels?: PerformanceLabels;
  accessibilityIssues: AccessibilityIssue[];
  pages: PageResult[];
  errorMessage?: string;
}

export interface ScanConfiguration {
  url: string;
  options: {
    consoleOutput: boolean;
    jsErrors: boolean;
    networkFailures: boolean;
    brokenAssets: boolean;
    performance: boolean;
    accessibility: boolean;
  };
  advanced: {
    maxPages: number;
    interactionDepth: 'standard' | 'deep' | 'minimal';
    device: 'mobile' | 'desktop';
  };
}
