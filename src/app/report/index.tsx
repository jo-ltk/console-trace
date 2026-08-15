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
import type { ScanResult } from '../../types/scan';

type TabType = 'overview' | 'console' | 'runtime' | 'network' | 'performance';

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
                {scan.startedAt} · {scan.pagesScanned || 1} page analyzed
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
            title={`Console (${scan.consoleObservations?.length || scan.summary.consoleCount})`}
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
            title="Vitals"
            active={activeTab === 'performance'}
            onPress={() => setActiveTab('performance')}
          />
        </ScrollView>

        {/* TAB CONTENTS */}
        {activeTab === 'overview' && (
          <View style={styles.section}>
            <Text style={[Typography.pixelLabel, styles.sectionTitle]}>TELEMETRY SUMMARY</Text>
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

        {activeTab === 'console' && (
          <View style={styles.section}>
            <Text style={[Typography.pixelLabel, styles.sectionTitle]}>CONSOLE OBSERVATIONS</Text>
            {scan.consoleObservations && scan.consoleObservations.length > 0 ? (
              scan.consoleObservations.map((c) => (
                <TraceCard key={c.id} style={styles.issueCard}>
                  <View style={styles.issueHeader}>
                    <Text style={[Typography.pixelLabel, { color: c.type === 'error' ? Colors.accent : c.type === 'warn' ? Colors.warning : Colors.muted }]}>
                      [{c.type.toUpperCase()}]
                    </Text>
                    <Text style={[Typography.caption, { color: Colors.muted }]}>{c.timestamp}</Text>
                  </View>
                  <Text style={[Typography.codeSnippet, styles.codeText]}>{c.message}</Text>
                </TraceCard>
              ))
            ) : (
              <TraceCard style={styles.emptyCard}>
                <Text style={[Typography.bodyMedium, { color: Colors.muted }]}>
                  No console noise or warnings detected.
                </Text>
              </TraceCard>
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
                <Text style={[Typography.bodyMedium, { color: Colors.success }]}>
                  Zero runtime JavaScript crashes detected!
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
