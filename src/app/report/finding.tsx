import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../../constants/colors';
import { Spacing } from '../../constants/spacing';
import { Typography } from '../../constants/typography';
import { TraceHeader } from '../../components/ui/TraceHeader';
import { TraceCard } from '../../components/ui/TraceCard';
import { TraceButton } from '../../components/ui/TraceButton';
import { useAppStore } from '../../stores/useAppStore';
import { api } from '../../services/api';
import { toClientScan } from '../../services/adapter';
import type { ClientFinding, FindingSeverity, ScanResult } from '../../types/scan';

function severityColor(severity: FindingSeverity): string {
  if (severity === 'CRITICAL' || severity === 'ERROR') return Colors.accent;
  if (severity === 'WARNING') return Colors.warning;
  return Colors.muted;
}

export default function FindingDetailScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ scanId?: string; findingId?: string }>();
  const recentScans = useAppStore((s) => s.recentScans);
  const addRecentScan = useAppStore((s) => s.addRecentScan);
  const [scan, setScan] = useState<ScanResult | undefined>(recentScans.find((s) => s.id === params.scanId));

  useEffect(() => {
    if (!params.scanId) return;
    if (scan?.findings?.length) return;
    api
      .getResults(params.scanId)
      .then((raw) => {
        if (raw && (raw as { scan?: unknown }).scan) {
          const mapped = toClientScan(raw as Record<string, unknown>);
          setScan(mapped);
          addRecentScan(mapped);
        }
      })
      .catch(() => undefined);
  }, [params.scanId]);

  const finding: ClientFinding | undefined = scan?.findings.find((f) => f.id === params.findingId);

  return (
    <View style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: Spacing.xl, paddingBottom: insets.bottom + 48 }}>
        <TraceHeader statusText="FINDING" statusType="ready" />
        {!finding ? (
          <TraceCard style={{ marginTop: Spacing.lg, padding: Spacing.lg }}>
            <Text style={[Typography.bodyMedium, { color: Colors.muted }]}>Finding not loaded.</Text>
          </TraceCard>
        ) : (
          <>
            <TraceCard style={{ marginTop: Spacing.lg, padding: Spacing.lg }}>
              <Text style={[Typography.pixelLabel, { color: severityColor(finding.severity) }]}>{finding.severity}</Text>
              <Text style={[Typography.headline, { color: Colors.ink, marginTop: 8 }]}>{finding.title}</Text>
              <Text style={[Typography.bodySmall, { color: Colors.muted, marginTop: 4 }]}>{finding.summary}</Text>
            </TraceCard>
            <TraceCard style={styles.block}>
              <Row label="Page" value={finding.pageUrl ?? 'NOT OBSERVED'} />
              <Row label="URL" value={finding.url ?? 'NOT OBSERVED'} />
              <Row label="Observed" value={finding.firstObservedAt || 'NOT OBSERVED'} />
              <Row label="Occurrences" value={String(finding.occurrences)} />
              <Row label="Confidence" value={finding.confidence} />
            </TraceCard>
            <Text style={[Typography.pixelLabel, styles.label]}>EVIDENCE</Text>
            <TraceCard style={styles.block}>
              <Text style={[Typography.codeSnippet, { color: Colors.ink }]}>
                {finding.evidenceText || 'No structured evidence stored.'}
              </Text>
            </TraceCard>
            <Text style={[Typography.pixelLabel, styles.label]}>WHY IT MATTERS</Text>
            <TraceCard style={styles.block}>
              <Text style={[Typography.bodySmall, { color: Colors.ink }]}>{finding.whyItMatters}</Text>
            </TraceCard>
            {(finding.severity === 'CRITICAL' || finding.severity === 'ERROR' || finding.severity === 'WARNING') && (
              <>
                <Text style={[Typography.pixelLabel, styles.label]}>RECOMMENDED FIX</Text>
                <TraceCard style={styles.block}>
                  <Text style={[Typography.bodySmall, { color: Colors.ink }]}>{finding.recommendation}</Text>
                </TraceCard>
              </>
            )}
          </>
        )}
        <TraceButton label="BACK TO REPORT" onPress={() => router.back()} style={{ marginTop: Spacing.xl }} />
      </ScrollView>
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={[Typography.pixelLabel, { color: Colors.muted }]}>{label}</Text>
      <Text style={[Typography.bodySmall, { color: Colors.ink, flex: 1, textAlign: 'right' }]} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  block: { marginTop: Spacing.sm, padding: Spacing.md },
  label: { color: Colors.muted, marginTop: Spacing.lg, marginBottom: Spacing.xs },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
});
