import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../../constants/colors';
import { Spacing } from '../../constants/spacing';
import { Radii } from '../../constants/radii';
import { Typography } from '../../constants/typography';
import { TraceHeader } from '../../components/ui/TraceHeader';
import { TraceCard } from '../../components/ui/TraceCard';
import { TraceButton } from '../../components/ui/TraceButton';
import { BottomNavigation } from '../../components/ui/BottomNavigation';
import { useAppStore } from '../../stores/useAppStore';
import { triggerHaptic } from '../../utils/haptics';
import { api } from '../../services/api';
import { toClientScan } from '../../services/adapter';
import type { ScanResult, ClientFinding, FindingSeverity } from '../../types/scan';

type TabType =
  | 'overview'
  | 'issues'
  | 'console'
  | 'runtime'
  | 'network'
  | 'accessibility'
  | 'performance'
  | 'security'
  | 'seo'
  | 'pages';

export default function ReportScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const recentScans = useAppStore((s) => s.recentScans);
  const addRecentScan = useAppStore((s) => s.addRecentScan);

  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [fetched, setFetched] = useState<ScanResult | null>(null);

  useEffect(() => {
    if (!params.id) return;
    if (recentScans.find((s) => s.id === params.id)?.consoleObservations?.length) return;
    api
      .getResults(params.id)
      .then((raw) => {
        if (raw && (raw as { scan?: unknown }).scan) {
          const mapped = toClientScan(raw as Record<string, unknown>);
          setFetched(mapped);
          addRecentScan(mapped);
        }
      })
      .catch(() => undefined);
  }, [params.id]);

  const scan = fetched || recentScans.find((s) => s.id === params.id);

  const openFinding = (scanId: string, findingId: string) => {
    triggerHaptic('light');
    router.push(`/report/finding?scanId=${scanId}&findingId=${findingId}`);
  };

  const targetConsole = (scan?.consoleObservations ?? []).filter((c) => c.origin !== 'SCANNER' && c.origin !== 'BROWSER');
  const scannerConsole = (scan?.consoleObservations ?? []).filter((c) => c.origin === 'SCANNER');
  const browserConsole = (scan?.consoleObservations ?? []).filter((c) => c.origin === 'BROWSER');

  if (!scan) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <TraceHeader statusText="AUDIT REPORT" statusType="ready" />
        <TraceCard style={{ margin: Spacing.xl, padding: Spacing.lg }}>
          <Text style={[Typography.headline, { color: Colors.ink }]}>Scan not loaded</Text>
          <Text style={[Typography.bodySmall, { color: Colors.muted, marginTop: 8 }]}>
            No observed results for this scan. TRACE does not invent findings.
          </Text>
          <TraceButton label="BACK HOME" onPress={() => router.replace('/')} style={{ marginTop: Spacing.md }} />
        </TraceCard>
      </View>
    );
  }

  const getScoreColor = (score: number) => {
    if (score >= 90) return Colors.success;
    if (score >= 70) return Colors.warning;
    return Colors.accent;
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.contentContainer,
          { paddingBottom: insets.bottom + 96 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <TraceHeader statusText="AUDIT REPORT" statusType="ready" />

        {/* Target Header & Health Score Banner */}
        <TraceCard style={styles.scoreCard}>
          <View style={styles.scoreRow}>
            <View style={{ flex: 1 }}>
              <Text style={[Typography.pixelLabel, { color: Colors.muted }]}>TARGET AUDIT</Text>
              <Text style={[Typography.headline, { color: Colors.ink, marginTop: 4 }]} numberOfLines={1}>
                {scan.normalizedUrl.replace(/^https?:\/\//, '')}
              </Text>
              <Text style={[Typography.caption, { color: Colors.muted, marginTop: 2 }]}>
                {scan.startedAt} · {scan.pagesScanned || scan.pages?.length || 1} pages analyzed
              </Text>
            </View>

            <View style={styles.scoreContainer}>
              <Text style={[Typography.pixelScore, { color: getScoreColor(scan.healthScore), fontSize: 32 }]}>
                {scan.healthScore}
              </Text>
              <Text style={[Typography.pixelLabel, { color: Colors.muted, fontSize: 10 }]}>
                /100
              </Text>
            </View>
          </View>
        </TraceCard>

        {/* Diagnostic Tabs */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.tabsScroll}
          contentContainerStyle={styles.tabsContainer}
        >
          <TabButton
            title="Overview"
            active={activeTab === 'overview'}
            onPress={() => setActiveTab('overview')}
          />
          <TabButton
            title={`Issues (${scan.findingsSummary?.total ?? scan.findings?.length ?? 0})`}
            active={activeTab === 'issues'}
            onPress={() => setActiveTab('issues')}
          />
          <TabButton
            title={`Console (${targetConsole.length})`}
            active={activeTab === 'console'}
            onPress={() => setActiveTab('console')}
          />
          <TabButton
            title={`Runtime (${scan.runtimeIssues?.length || scan.summary.runtimeCount})`}
            active={activeTab === 'runtime'}
            onPress={() => setActiveTab('runtime')}
          />
          <TabButton
            title={`Network (${scan.networkIssues?.length || scan.summary.networkCount})`}
            active={activeTab === 'network'}
            onPress={() => setActiveTab('network')}
          />
          <TabButton
            title={`A11y (${scan.summary.accessibilityCount})`}
            active={activeTab === 'accessibility'}
            onPress={() => setActiveTab('accessibility')}
          />
          <TabButton
            title="Performance"
            active={activeTab === 'performance'}
            onPress={() => setActiveTab('performance')}
          />
          <TabButton
            title="Security"
            active={activeTab === 'security'}
            onPress={() => setActiveTab('security')}
          />
          <TabButton
            title="SEO"
            active={activeTab === 'seo'}
            onPress={() => setActiveTab('seo')}
          />
          <TabButton
            title="Pages"
            active={activeTab === 'pages'}
            onPress={() => setActiveTab('pages')}
          />
        </ScrollView>

        {/* TAB CONTENTS */}
        {activeTab === 'overview' && (
          <View style={styles.section}>
            <Text style={[Typography.pixelLabel, styles.sectionTitle]}>ISSUES</Text>
            <View style={styles.summaryGrid}>
              <SummaryItem label="CRITICAL" count={scan.findingsSummary?.severity.critical ?? 0} type="error" />
              <SummaryItem label="ERROR" count={scan.findingsSummary?.severity.error ?? 0} type="error" />
              <SummaryItem label="WARNING" count={scan.findingsSummary?.severity.warning ?? 0} type="warn" />
              <SummaryItem label="INFO" count={scan.findingsSummary?.severity.info ?? 0} type="log" />
            </View>

            <Text style={[Typography.pixelLabel, [styles.sectionTitle, { marginTop: Spacing.lg }]]}>
              WHY {scan.healthScore}/100
            </Text>
            <TraceCard style={styles.vitalsCard}>
              <VitalRow label={`Runtime · ${(scan.runtimeIssues ?? []).length} observed`} value={String(scan.scores?.runtime ?? '—')} />
              <VitalRow label={`Network · ${scan.summary.networkCount} failures`} value={String(scan.scores?.network ?? '—')} />
              <VitalRow label={`Accessibility · ${scan.summary.accessibilityCount} violations`} value={String(scan.scores?.accessibility ?? '—')} />
              <VitalRow label={`Console · ${scan.summary.consoleCount} target messages`} value={String(scan.scores?.console ?? '—')} />
              <VitalRow label={`Security`} value={String(scan.scores?.security ?? '—')} />
              <VitalRow label={`Assets · ${scan.summary.assetsCount} broken`} value={String(scan.scores?.assets ?? '—')} />
              <VitalRow label={`SEO`} value={String(scan.scores?.seo ?? '—')} />
              <VitalRow label={`Performance`} value={String(scan.scores?.performance ?? '—')} />
            </TraceCard>
            {(scan.scores?.explanations.overall ?? []).length > 0 && (
              <Text style={[Typography.caption, { color: Colors.muted, marginTop: Spacing.sm }]}>
                {scan.scores?.explanations.overall.join(' · ')}
              </Text>
            )}

            <Text style={[Typography.pixelLabel, [styles.sectionTitle, { marginTop: Spacing.lg }]]}>
              TELEMETRY SUMMARY
            </Text>
            <View style={styles.summaryGrid}>
              <SummaryItem label="CONSOLE NOISE" count={scan.summary.consoleCount} type="log" />
              <SummaryItem label="JS EXCEPTIONS" count={scan.summary.runtimeCount} type="error" />
              <SummaryItem label="NETWORK FAILS" count={scan.summary.networkCount} type="network" />
              <SummaryItem label="A11Y ISSUES" count={scan.summary.accessibilityCount} type="warn" />
            </View>

            <Text style={[Typography.pixelLabel, [styles.sectionTitle, { marginTop: Spacing.lg }]]}>
              PERFORMANCE BENCHMARK
            </Text>
            <TraceCard style={styles.vitalsCard}>
              <VitalRow label="Largest Contentful Paint (LCP)" value={scan.performanceLabels?.lcp ?? `${scan.performanceMetrics.lcp}s`} />
              <VitalRow label="First Contentful Paint (FCP)" value={scan.performanceLabels?.fcp ?? `${scan.performanceMetrics.fcp}s`} />
              <VitalRow label="Cumulative Layout Shift (CLS)" value={scan.performanceLabels?.cls ?? `${scan.performanceMetrics.cls}`} />
              <VitalRow label="Time to First Byte (TTFB)" value={scan.performanceLabels?.ttfb ?? `${scan.performanceMetrics.ttfb}ms`} />
            </TraceCard>
          </View>
        )}

        {activeTab === 'issues' && (
          <View style={styles.section}>
            <Text style={[Typography.pixelLabel, styles.sectionTitle]}>FINDINGS BY SEVERITY</Text>
            {(scan.findings ?? []).length > 0 ? (
              (scan.findings ?? []).map((f) => (
                <FindingRow key={f.id} finding={f} onPress={() => openFinding(scan.id, f.id)} />
              ))
            ) : (
              <TraceCard style={styles.emptyCard}>
                <Text style={[Typography.bodyMedium, { color: Colors.muted }]}>No normalized findings.</Text>
              </TraceCard>
            )}
          </View>
        )}

        {activeTab === 'console' && (
          <View style={styles.section}>
            <Text style={[Typography.pixelLabel, styles.sectionTitle]}>TARGET CONSOLE</Text>
            {targetConsole.length > 0 ? (
              targetConsole.map((c) => (
                <TraceCard key={c.id} style={styles.issueCard}>
                  <View style={styles.issueHeader}>
                    <Text style={[Typography.pixelLabel, { color: c.type === 'error' ? Colors.accent : c.type === 'warn' ? Colors.warning : Colors.muted }]}>
                      [TARGET · {c.type.toUpperCase()}]
                    </Text>
                    <Text style={[Typography.caption, { color: Colors.muted }]}>{c.timestamp}</Text>
                  </View>
                  <Text style={[Typography.caption, { color: Colors.muted, marginTop: 4 }]} numberOfLines={1}>
                    {c.pageUrl}
                  </Text>
                  <Text style={[Typography.codeSnippet, styles.codeText]}>{c.message}</Text>
                </TraceCard>
              ))
            ) : (
              <TraceCard style={styles.emptyCard}>
                <Text style={[Typography.bodyMedium, { color: Colors.muted }]}>
                  No target-site console messages observed.
                </Text>
              </TraceCard>
            )}

            {scannerConsole.length > 0 && (
              <>
                <Text style={[Typography.pixelLabel, styles.sectionTitle, { marginTop: Spacing.lg }]}>
                  SCANNER-GENERATED
                </Text>
                <Text style={[Typography.caption, { color: Colors.muted, marginBottom: Spacing.sm }]}>
                  Produced by TRACE or Chromium while collecting telemetry. Not website console problems.
                </Text>
                {scannerConsole.map((c) => (
                  <TraceCard key={c.id} style={styles.issueCard}>
                    <View style={styles.issueHeader}>
                      <Text style={[Typography.pixelLabel, { color: Colors.muted }]}>[SCANNER · {c.type.toUpperCase()}]</Text>
                    </View>
                    <Text style={[Typography.codeSnippet, styles.codeText]}>{c.message}</Text>
                  </TraceCard>
                ))}
              </>
            )}

            {browserConsole.length > 0 && (
              <>
                <Text style={[Typography.pixelLabel, styles.sectionTitle, { marginTop: Spacing.lg }]}>
                  BROWSER
                </Text>
                {browserConsole.map((c) => (
                  <TraceCard key={c.id} style={styles.issueCard}>
                    <View style={styles.issueHeader}>
                      <Text style={[Typography.pixelLabel, { color: Colors.muted }]}>[BROWSER · {c.type.toUpperCase()}]</Text>
                    </View>
                    <Text style={[Typography.codeSnippet, styles.codeText]}>{c.message}</Text>
                  </TraceCard>
                ))}
              </>
            )}
          </View>
        )}

        {activeTab === 'runtime' && (
          <View style={styles.section}>
            <Text style={[Typography.pixelLabel, styles.sectionTitle]}>UNCAUGHT RUNTIME EXCEPTIONS</Text>
            {scan.runtimeIssues && scan.runtimeIssues.length > 0 ? (
              scan.runtimeIssues.map((r) => (
                <TraceCard key={r.id} style={{ ...styles.issueCard, borderColor: Colors.accent }}>
                  <View style={styles.issueHeader}>
                    <Text style={[Typography.pixelLabel, { color: Colors.accent }]}>[CRITICAL EXCEPTION]</Text>
                    <Text style={[Typography.caption, { color: Colors.muted }]}>{r.timestamp}</Text>
                  </View>
                  <Text style={[Typography.headline, { color: Colors.ink, marginVertical: 4 }]}>
                    {r.message}
                  </Text>
                  {r.stack && (
                    <Text style={[Typography.codeSnippet, styles.codeText, { marginTop: 4 }]}>
                      {r.stack}
                    </Text>
                  )}
                </TraceCard>
              ))
            ) : (
              <TraceCard style={styles.emptyCard}>
                <Text style={[Typography.bodyMedium, { color: Colors.muted }]}>
                  No runtime exceptions observed.
                </Text>
              </TraceCard>
            )}
          </View>
        )}

        {activeTab === 'network' && (
          <View style={styles.section}>
            <Text style={[Typography.pixelLabel, styles.sectionTitle]}>NETWORK & API FAILURES</Text>
            {scan.networkIssues && scan.networkIssues.length > 0 ? (
              scan.networkIssues.map((n) => (
                <TraceCard key={n.id} style={styles.issueCard}>
                  <View style={styles.issueHeader}>
                    <Text style={[Typography.pixelLabel, { color: Colors.accent }]}>
                      [{n.method} {n.status}]
                    </Text>
                    <Text style={[Typography.caption, { color: Colors.muted }]}>{n.duration}ms</Text>
                  </View>
                  <Text style={[Typography.codeSnippet, styles.codeText, { marginTop: 4 }]}>
                    {n.url}
                  </Text>
                </TraceCard>
              ))
            ) : (
              <TraceCard style={styles.emptyCard}>
                <Text style={[Typography.bodyMedium, { color: Colors.muted }]}>
                  NOT OBSERVED
                </Text>
              </TraceCard>
            )}
          </View>
        )}

        {activeTab === 'accessibility' && (
          <CategoryFindings
            title="ACCESSIBILITY FINDINGS"
            findings={(scan.findings ?? []).filter((f) => f.category === 'accessibility')}
            onOpen={(f) => openFinding(scan.id, f.id)}
          />
        )}

        {activeTab === 'performance' && (
          <View style={styles.section}>
            <Text style={[Typography.pixelLabel, styles.sectionTitle]}>CORE WEB VITALS</Text>
            <TraceCard style={styles.vitalsCard}>
              <VitalRow label="Largest Contentful Paint (LCP)" value={scan.performanceLabels?.lcp ?? `${scan.performanceMetrics.lcp}s`} />
              <VitalRow label="First Contentful Paint (FCP)" value={scan.performanceLabels?.fcp ?? `${scan.performanceMetrics.fcp}s`} />
              <VitalRow label="Cumulative Layout Shift (CLS)" value={scan.performanceLabels?.cls ?? `${scan.performanceMetrics.cls}`} />
              <VitalRow label="Interaction to Next Paint (INP)" value={scan.performanceLabels?.inp ?? `${scan.performanceMetrics.inp}ms`} />
              <VitalRow label="Time to First Byte (TTFB)" value={scan.performanceLabels?.ttfb ?? `${scan.performanceMetrics.ttfb}ms`} />
            </TraceCard>
            <CategoryFindings
              title="PERFORMANCE FINDINGS"
              findings={(scan.findings ?? []).filter((f) => f.category === 'performance')}
              onOpen={(f) => openFinding(scan.id, f.id)}
            />
          </View>
        )}

        {activeTab === 'security' && (
          <CategoryFindings
            title="SECURITY FINDINGS"
            findings={(scan.findings ?? []).filter((f) => f.category === 'security')}
            onOpen={(f) => openFinding(scan.id, f.id)}
          />
        )}

        {activeTab === 'seo' && (
          <CategoryFindings
            title="SEO FINDINGS"
            findings={(scan.findings ?? []).filter((f) => f.category === 'seo')}
            onOpen={(f) => openFinding(scan.id, f.id)}
          />
        )}

        {activeTab === 'pages' && (
          <View style={styles.section}>
            <Text style={[Typography.pixelLabel, styles.sectionTitle]}>PAGES CRAWLED</Text>
            <TraceCard style={styles.vitalsCard}>
              {(scan.pages ?? []).length > 0 ? (
                (scan.pages ?? []).map((p) => (
                  <View key={p.id} style={styles.vitalRow}>
                    <Text style={[Typography.bodySmall, { color: Colors.ink, flex: 1, paddingRight: Spacing.sm }]} numberOfLines={1}>
                      {p.url.replace(/^https?:\/\//, '')}
                    </Text>
                    <Text style={[Typography.pixelLabel, { color: p.status === 'error' ? Colors.accent : p.status === 'warning' ? Colors.warning : Colors.success }]}>
                      {p.statusCode ?? p.status}
                    </Text>
                  </View>
                ))
              ) : (
                <Text style={[Typography.bodySmall, { color: Colors.muted }]}>NOT OBSERVED</Text>
              )}
            </TraceCard>
          </View>
        )}

        <TraceButton
          label="RUN NEW INSPECTION"
          onPress={() => router.replace('/')}
          style={{ marginTop: Spacing.xl }}
        />
      </ScrollView>

      <BottomNavigation />
    </View>
  );
}

function severityColor(severity: FindingSeverity): string {
  if (severity === 'CRITICAL' || severity === 'ERROR') return Colors.accent;
  if (severity === 'WARNING') return Colors.warning;
  return Colors.muted;
}

function FindingRow({ finding, onPress }: { finding: ClientFinding; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress}>
      <TraceCard style={styles.issueCard}>
        <View style={styles.issueHeader}>
          <Text style={[Typography.pixelLabel, { color: severityColor(finding.severity) }]}>
            [{finding.severity} · {finding.category.toUpperCase()}]
          </Text>
          <Text style={[Typography.caption, { color: Colors.muted }]}>×{finding.occurrences}</Text>
        </View>
        <Text style={[Typography.headline, { color: Colors.ink, marginTop: 4 }]}>{finding.title}</Text>
        <Text style={[Typography.bodySmall, { color: Colors.muted, marginTop: 2 }]}>{finding.summary}</Text>
      </TraceCard>
    </TouchableOpacity>
  );
}

function CategoryFindings({
  title,
  findings,
  onOpen,
}: {
  title: string;
  findings: ClientFinding[];
  onOpen: (f: ClientFinding) => void;
}) {
  return (
    <View style={styles.section}>
      <Text style={[Typography.pixelLabel, styles.sectionTitle]}>{title}</Text>
      {findings.length > 0 ? (
        findings.map((f) => <FindingRow key={f.id} finding={f} onPress={() => onOpen(f)} />)
      ) : (
        <TraceCard style={styles.emptyCard}>
          <Text style={[Typography.bodyMedium, { color: Colors.muted }]}>No findings in this category.</Text>
        </TraceCard>
      )}
    </View>
  );
}

function TabButton({
  title,
  active,
  onPress,
}: {
  title: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.tabBtn, active && styles.tabBtnActive]}
      onPress={() => {
        triggerHaptic('light');
        onPress();
      }}
    >
      <Text style={[styles.tabText, active && styles.tabTextActive]}>{title}</Text>
    </TouchableOpacity>
  );
}

function SummaryItem({
  label,
  count,
  type,
}: {
  label: string;
  count: number;
  type: 'log' | 'error' | 'network' | 'warn';
}) {
  const color =
    type === 'error'
      ? Colors.accent
      : type === 'warn'
      ? Colors.warning
      : Colors.ink;

  return (
    <View style={styles.summaryItem}>
      <Text style={[Typography.pixelScore, { color, fontSize: 24 }]}>{count}</Text>
      <Text style={[Typography.pixelLabel, { color: Colors.muted, fontSize: 9, marginTop: 2 }]}>
        {label}
      </Text>
    </View>
  );
}

function VitalRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.vitalRow}>
      <Text style={[Typography.bodySmall, { color: Colors.ink }]}>{label}</Text>
      <Text style={[Typography.pixelLabel, { color: Colors.ink }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.md,
  },
  scoreCard: {
    marginTop: Spacing.lg,
    marginBottom: Spacing.md,
    padding: Spacing.lg,
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  scoreContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
    backgroundColor: Colors.surface,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: Radii.md,
  },
  tabsScroll: {
    marginVertical: Spacing.md,
  },
  tabsContainer: {
    flexDirection: 'row',
    gap: Spacing.xs,
  },
  tabBtn: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
    borderRadius: Radii.sm,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  tabBtnActive: {
    backgroundColor: Colors.ink,
    borderColor: Colors.ink,
  },
  tabText: {
    fontSize: 11,
    fontFamily: Typography.pixelLabel.fontFamily,
    color: Colors.muted,
  },
  tabTextActive: {
    color: Colors.white,
  },
  section: {
    marginTop: Spacing.sm,
  },
  sectionTitle: {
    color: Colors.muted,
    marginBottom: Spacing.sm,
    letterSpacing: 1.2,
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  summaryItem: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radii.sm,
    padding: Spacing.md,
    alignItems: 'center',
  },
  vitalsCard: {
    padding: Spacing.md,
  },
  vitalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: Spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  issueCard: {
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  issueHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  codeText: {
    backgroundColor: Colors.surface,
    padding: Spacing.sm,
    borderRadius: Radii.sm,
    marginTop: Spacing.xs,
    color: Colors.ink,
    fontSize: 12,
  },
  emptyCard: {
    padding: Spacing.xl,
    alignItems: 'center',
  },
});
