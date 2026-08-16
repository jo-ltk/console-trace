export type ScanStatus =
  | 'queued'
  | 'launching_browser'
  | 'loading_page'
  | 'discovering_pages'
  | 'observing_network'
  | 'analyzing_runtime'
  | 'running_accessibility'
  | 'analyzing_security'
  | 'generating_report'
  | 'completed'
  | 'completed_with_warnings'
  | 'failed'
  | 'cancelled';

export type IssueSeverity = 'CRITICAL' | 'ERROR' | 'WARNING' | 'INFO';

export type ScanDevice = 'mobile' | 'desktop';

export interface ScanOptions {
  maxPages?: number;
  maxDepth?: number;
  timeout?: number; // per page timeout ms
  device?: ScanDevice;
  interactions?: boolean;
  accessibility?: boolean;
  performance?: boolean;
  security?: boolean;
  activeProbing?: boolean;
}

export interface ScanRequest {
  url: string;
  options?: ScanOptions;
}

export type ConsoleSource = 'TARGET' | 'SCANNER' | 'BROWSER';

export interface ConsoleEvent {
  id: string;
  type: 'log' | 'info' | 'warn' | 'error' | 'debug' | 'trace' | 'dir' | 'table' | 'assert' | 'clear';
  text: string;
  pageUrl: string;
  timestamp: string;
  sourceUrl?: string;
  line?: number;
  column?: number;
  args?: string[];
  classification: 'RUNTIME_OBSERVED' | 'STATIC_SOURCE_DETECTED';
  /** Who produced the message. SCANNER/BROWSER must not be scored as site console noise. */
  source: ConsoleSource;
}

export interface RuntimeErrorEvent {
  id: string;
  message: string;
  stack?: string;
  pageUrl: string;
  timestamp: string;
  sourceUrl?: string;
  line?: number;
  column?: number;
  type: 'pageerror' | 'uncaught_exception' | 'unhandled_rejection' | 'browser_crash' | 'execution_failure';
}

export type ResourceType =
  | 'document'
  | 'script'
  | 'stylesheet'
  | 'image'
  | 'font'
  | 'xhr'
  | 'fetch'
  | 'media'
  | 'manifest'
  | 'websocket'
  | 'other';

export interface NetworkEvent {
  id: string;
  url: string;
  method: string;
  resourceType: ResourceType;
  status: number;
  statusText?: string;
  requestHeaders: Record<string, string>;
  responseHeaders: Record<string, string>;
  requestSize?: number;
  responseSize?: number;
  duration: number; // ms
  pageUrl: string;
  initiator?: string;
  failureReason?: string;
  isApi: boolean;
  apiType?: 'REST' | 'GraphQL' | 'JSON' | 'WebSocket' | 'RPC' | 'other';
  timing?: {
    dns?: number;
    tls?: number;
    ttfb?: number;
    download?: number;
  };
}

export interface NetworkFailure {
  id: string;
  url: string;
  method: string;
  status: number;
  reason: string;
  pageUrl: string;
  resourceType: ResourceType;
  duration: number;
}

export interface ApiInventoryItem {
  method: string;
  url: string;
  status: number;
  contentType: string;
  duration: number;
  frequency: number;
  pageUrl: string;
  resourceType: ResourceType;
  apiType: string;
  statusTag: 'OBSERVED';
}

export interface FormField {
  name: string;
  type: string;
  required: boolean;
  autocomplete?: string;
  hasLabel: boolean;
  labelContent?: string;
  hasAriaLabel: boolean;
  id?: string;
}

export interface FormFinding {
  pageUrl: string;
  action: string;
  method: string;
  fields: FormField[];
  issues: string[];
}

export interface BrokenResource {
  url: string;
  pageUrl: string;
  resourceType: ResourceType;
  status: number;
  error?: string;
}

export interface BrokenLink {
  url: string;
  sourcePageUrl: string;
  status: number;
  reason: string;
}

export interface RedirectStep {
  url: string;
  status: number;
  location?: string;
}

export interface RedirectChain {
  initialUrl: string;
  finalUrl: string;
  steps: RedirectStep[];
  isHttpsUpgrade: boolean;
  isLoop: boolean;
  isCrossDomain: boolean;
  totalTime: number;
}

export interface PerformanceMetrics {
  fcp: number | 'NOT AVAILABLE'; // ms
  lcp: number | 'NOT AVAILABLE'; // ms
  cls: number | 'NOT AVAILABLE';
  inp: number | 'NOT AVAILABLE'; // ms
  ttfb: number | 'NOT AVAILABLE'; // ms
  domContentLoaded: number | 'NOT AVAILABLE'; // ms
  loadTime: number | 'NOT AVAILABLE'; // ms
  longTasksCount: number;
  totalTransferSizeBytes: number;
  jsSizeBytes: number;
  cssSizeBytes: number;
  imageSizeBytes: number;
  fontSizeBytes: number;
  requestCount: number;
}

export interface AccessibilityFinding {
  id: string;
  rule: string;
  impact: 'critical' | 'serious' | 'moderate' | 'minor';
  description: string;
  help?: string;
  helpUrl: string;
  elementHtml: string;
  selector: string;
  pageUrl: string;
}

export interface SecurityFinding {
  id: string;
  category: 'HEADER' | 'TLS' | 'COOKIE' | 'CORS' | 'SOURCEMAP' | 'MIXED_CONTENT';
  name: string;
  severity: IssueSeverity;
  status: 'PASS' | 'FAIL' | 'WARNING' | 'INFO' | 'NOT TESTED';
  evidence: string;
  recommendation?: string;
}

export interface CookieFinding {
  name: string;
  domain: string;
  path: string;
  secure: boolean;
  httpOnly: boolean;
  sameSite: string;
  isRisky: boolean;
  riskReason?: string;
}

export interface SourceMapFinding {
  scriptUrl: string;
  mapUrl: string;
  isAccessible: boolean;
  statusCode?: number;
  sizeBytes?: number;
  hasSources?: boolean;
}

export interface SeoFinding {
  pageUrl: string;
  title?: string;
  metaDescription?: string;
  canonicalUrl?: string;
  lang?: string;
  robotsMeta?: string;
  hasH1: boolean;
  h1Count: number;
  ogTags: Record<string, string>;
  twitterTags: Record<string, string>;
  issues: { severity: IssueSeverity; message: string }[];
}

export interface ThirdPartyDomain {
  domain: string;
  requestCount: number;
  resourceTypes: ResourceType[];
  pages: string[];
}

export interface StorageInspection {
  localStorageKeys: string[];
  sessionStorageKeys: string[];
  indexedDbNames: string[];
  hasDetectedToken: boolean;
  tokenLocations: string[];
}

export interface WebSocketObservation {
  url: string;
  pageUrl: string;
  status: 'connected' | 'failed' | 'closed';
  closeCode?: number;
  duration: number;
}

export interface ServiceWorkerObservation {
  scope?: string;
  scriptUrl?: string;
  status: 'registered' | 'failed' | 'not_supported';
  error?: string;
}

export interface PwaObservation {
  hasManifest: boolean;
  manifestUrl?: string;
  name?: string;
  shortName?: string;
  display?: string;
  themeColor?: string;
  hasIcons: boolean;
  hasServiceWorker: boolean;
}

export interface DeduplicatedIssue {
  id: string;
  type: string;
  category: 'RUNTIME' | 'NETWORK' | 'CONSOLE' | 'PERFORMANCE' | 'ACCESSIBILITY' | 'SECURITY' | 'SEO' | 'ASSETS';
  severity: IssueSeverity;
  title: string;
  description: string;
  occurrences: number;
  pages: string[];
  evidence: {
    url?: string;
    page?: string;
    status?: number;
    timestamp?: string;
    source?: string;
    line?: number;
    column?: number;
    method?: string;
    snippet?: string;
    helpUrl?: string;
  };
}

export interface HealthScoreBreakdown {
  overall: number;
  runtime: number;
  network: number;
  console: number;
  performance: number;
  accessibility: number;
  security: number;
  seo: number;
  assets: number;
  consoleNoiseScore: number;
  explanations: Record<string, string[]>;
}

export interface ScannedPageResult {
  id: string;
  url: string;
  title: string;
  status: 'healthy' | 'warning' | 'error';
  statusCode: number;
  issuesCount: number;
  duration: number;
  depth: number;
  /** Page that linked here during the crawl, when known. */
  linkedFrom?: string;
}

export type FindingCategory =
  | 'console'
  | 'runtime'
  | 'network'
  | 'assets'
  | 'performance'
  | 'accessibility'
  | 'security'
  | 'seo';

export type FindingConfidence = 'HIGH' | 'MEDIUM' | 'LOW';

export interface FindingLocation {
  pageUrl?: string;
  url?: string;
  selector?: string;
  source?: string;
  line?: number;
  column?: number;
}

export interface FindingEvidence {
  type: string;
  [key: string]: unknown;
}

export interface Finding {
  id: string;
  scanId: string;
  pageId?: string;
  category: FindingCategory;
  kind: string;
  severity: IssueSeverity;
  title: string;
  summary: string;
  description: string;
  evidence: FindingEvidence;
  evidenceText: string;
  location: FindingLocation;
  pages: string[];
  occurrences: number;
  firstObservedAt: string;
  lastObservedAt: string;
  source: string;
  confidence: FindingConfidence;
  recommendation: string;
  whyItMatters: string;
  dedupeKey: string;
}

export interface SeverityCounts {
  critical: number;
  error: number;
  warning: number;
  info: number;
}

export interface FindingsSummary {
  total: number;
  severity: SeverityCounts;
  byCategory: Record<FindingCategory, SeverityCounts>;
}

export interface ScanResult {
  scan: {
    id: string;
    url: string;
    normalizedUrl: string;
    status: ScanStatus;
    statusReason?: string;
    startedAt: string;
    completedAt?: string;
    durationMs: number;
    device: ScanDevice;
  };
  summary: {
    pagesDiscovered: number;
    pagesScanned: number;
    requestsObserved: number;
    consoleEvents: number;
    consoleTargetEvents: number;
    consoleScannerEvents: number;
    consoleBrowserEvents: number;
    runtimeErrors: number;
    networkFailures: number;
    accessibilityViolations: number;
    securityFindings: number;
    brokenAssets: number;
    findings: number;
    findingsCritical: number;
    findingsError: number;
    findingsWarning: number;
    findingsInfo: number;
  };
  scores: HealthScoreBreakdown;
  findings: Finding[];
  findingsSummary: FindingsSummary;
  issues: DeduplicatedIssue[];
  pages: ScannedPageResult[];
  consoleEvents: ConsoleEvent[];
  runtimeErrors: RuntimeErrorEvent[];
  networkEvents: NetworkEvent[];
  networkFailures: NetworkFailure[];
  apiInventory: ApiInventoryItem[];
  performance: PerformanceMetrics;
  accessibility: AccessibilityFinding[];
  securityFindings: SecurityFinding[];
  cookies: CookieFinding[];
  sourceMaps: SourceMapFinding[];
  seoFindings: SeoFinding[];
  forms: FormFinding[];
  brokenResources: BrokenResource[];
  brokenLinks: BrokenLink[];
  redirects: RedirectChain[];
  thirdParty: ThirdPartyDomain[];
  storage: StorageInspection;
  webSockets: WebSocketObservation[];
  serviceWorker: ServiceWorkerObservation;
  pwa: PwaObservation;
  screenshots: {
    homepage?: string;
    viewport?: string;
    errorPages?: Record<string, string>;
  };
}
