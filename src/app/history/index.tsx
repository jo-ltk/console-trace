import React, { useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Colors } from '../../constants/colors';
import { Spacing } from '../../constants/spacing';
import { Typography } from '../../constants/typography';
import { Radii } from '../../constants/radii';
import { TraceHeader } from '../../components/ui/TraceHeader';
import { TraceCard } from '../../components/ui/TraceCard';
import { BottomNavigation } from '../../components/ui/BottomNavigation';
import { useAppStore } from '../../stores/useAppStore';
import { api } from '../../services/api';
import { toClientScan } from '../../services/adapter';

export default function HistoryScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const recentScans = useAppStore((s) => s.recentScans);
  const setRecentScans = useAppStore((s) => s.setRecentScans);

  useEffect(() => {
    api
      .listScans()
      .then((rows) => {
        const mapped = rows
          .filter((r) => r.summary)
          .map((r) =>
            toClientScan({
              scan: {
                id: r.scanId,
                url: r.url,
                normalizedUrl: r.url,
                status: r.status,
                startedAt: r.createdAt,
              },
              summary: r.summary,
              scores: r.scores,
              consoleEvents: [],
              runtimeErrors: [],
              networkFailures: [],
              accessibility: [],
              pages: [],
              performance: {},
            }),
          );
        setRecentScans(mapped);
      })
      .catch(() => undefined);
  }, [setRecentScans]);

  return (
    <View style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.contentContainer, { paddingBottom: insets.bottom + 96 }]}
        showsVerticalScrollIndicator={false}
      >
        <TraceHeader statusText="OBSERVATION HISTORY" statusType="idle" />

        <View style={styles.hero}>
          <Text style={[Typography.title1, { color: Colors.ink }]}>Scan History</Text>
          <Text style={[Typography.bodySmall, { color: Colors.muted, marginTop: 4 }]}>
            Results from the TRACE API. Empty until a real scan completes.
          </Text>
        </View>

        {recentScans.length === 0 ? (
          <TraceCard variant="surface" style={styles.emptyCard}>
            <Text style={[Typography.headline, { color: Colors.ink, marginBottom: 4 }]}>
              No previous observations.
            </Text>
            <Text style={[Typography.bodySmall, { color: Colors.muted }]}>
              Scans performed on websites will be recorded here after they complete.
            </Text>
          </TraceCard>
        ) : (
          recentScans.map((scan) => (
            <TraceCard
              key={scan.id}
              style={styles.scanCard}
              onPress={() => router.push({ pathname: '/report' as any, params: { id: scan.id } })}
            >
              <View style={styles.cardRow}>
                <View style={{ flex: 1 }}>
                  <Text style={[Typography.headline, { color: Colors.ink }]}>
                    {scan.normalizedUrl.replace(/^https?:\/\//, '')}
                  </Text>
                  <Text style={[Typography.caption, { color: Colors.muted, marginTop: 4 }]}>
                    {scan.startedAt} · {scan.pagesScanned} pages
                  </Text>
                </View>
                <View style={styles.scoreContainer}>
                  <Text style={[Typography.pixelScore, { color: Colors.ink }]}>{scan.healthScore}</Text>
                  <Text style={[Typography.pixelLabel, { color: Colors.muted, fontSize: 9 }]}>/100</Text>
                </View>
              </View>
            </TraceCard>
          ))
        )}
      </ScrollView>

      <BottomNavigation />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  scrollView: { flex: 1 },
  contentContainer: { paddingHorizontal: Spacing.xl, paddingTop: Spacing.md },
  hero: { marginTop: Spacing.lg, marginBottom: Spacing.lg },
  emptyCard: { padding: Spacing.lg },
  scanCard: { marginBottom: Spacing.md, padding: Spacing.md },
  cardRow: { flexDirection: 'row', alignItems: 'center' },
  scoreContainer: { flexDirection: 'row', alignItems: 'baseline' },
});
