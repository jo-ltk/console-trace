import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../../constants/colors';
import { Spacing } from '../../constants/spacing';
import { Radii } from '../../constants/radii';
import { Typography } from '../../constants/typography';
import { TraceHeader } from '../../components/ui/TraceHeader';
import { TraceCard } from '../../components/ui/TraceCard';
import { TraceButton } from '../../components/ui/TraceButton';
import { useAppStore } from '../../stores/useAppStore';
import { triggerHaptic } from '../../utils/haptics';
import { api } from '../../services/api';
import { toClientScan } from '../../services/adapter';

const SCAN_STEPS = [
  { id: 'queued', title: 'Queued', statuses: ['queued'] },
  { id: 'launching_browser', title: 'Launching Chromium', statuses: ['launching_browser'] },
  { id: 'loading_page', title: 'Loading page', statuses: ['loading_page'] },
  { id: 'discovering_pages', title: 'Discovering pages', statuses: ['discovering_pages'] },
  { id: 'observing_network', title: 'Observing network', statuses: ['observing_network'] },
  { id: 'analyzing_runtime', title: 'Analyzing runtime', statuses: ['analyzing_runtime'] },
  { id: 'running_accessibility', title: 'Running accessibility', statuses: ['running_accessibility'] },
  { id: 'analyzing_security', title: 'Analyzing security', statuses: ['analyzing_security'] },
  { id: 'generating_report', title: 'Generating report', statuses: ['generating_report'] },
];

function stepIndex(status: string): number {
  const i = SCAN_STEPS.findIndex((s) => s.statuses.includes(status));
  return i === -1 ? 0 : i;
}

export default function ScanProgressScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ url?: string }>();
  const addRecentScan = useAppStore((s) => s.addRecentScan);
  const setActiveScanId = useAppStore((s) => s.setActiveScanId);
  const currentConfig = useAppStore((s) => s.currentConfig);

  const targetUrl = params.url || currentConfig.url;
  const [status, setStatus] = useState('queued');
  const [error, setError] = useState<string | null>(null);
  const [scanId, setScanId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | undefined;

    const run = async () => {
      if (!targetUrl) {
        setError('No target URL');
        return;
      }
      try {
        const created = await api.createScan(targetUrl, {
          maxPages: currentConfig.advanced.maxPages,
          maxDepth: currentConfig.advanced.interactionDepth === 'deep' ? 4 : currentConfig.advanced.interactionDepth === 'minimal' ? 1 : 3,
          device: currentConfig.advanced.device,
          accessibility: currentConfig.options.accessibility,
          performance: currentConfig.options.performance,
          security: true,
          interactions: currentConfig.advanced.interactionDepth !== 'minimal',
        });
        if (cancelled) return;
        setScanId(created.scanId);
        setActiveScanId(created.scanId);
        setStatus(created.status);

        timer = setInterval(async () => {
          try {
            const st = await api.getStatus(created.scanId);
            if (cancelled) return;
            setStatus(st.status);
            if (['completed', 'completed_with_warnings', 'failed', 'cancelled'].includes(st.status)) {
              if (timer) clearInterval(timer);
              if (st.status === 'failed') {
                setError(st.statusReason || 'Scan failed');
                triggerHaptic('error');
                return;
              }
              if (st.status === 'cancelled') {
                router.back();
                return;
              }
              const raw = await api.getResults(created.scanId);
              const mapped = toClientScan(raw as Record<string, unknown>);
              addRecentScan(mapped);
              triggerHaptic('success');
              router.replace({ pathname: '/report' as any, params: { id: mapped.id } });
            }
          } catch (e) {
            if (!cancelled) setError((e as Error).message);
          }
        }, 1000);
      } catch (e) {
        if (!cancelled) {
          setError((e as Error).message);
          triggerHaptic('error');
        }
      }
    };

    run();
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [targetUrl]);

  const idx = stepIndex(status);
  const progressPercent = Math.round(((idx + 1) / SCAN_STEPS.length) * 100);
  const currentStep = SCAN_STEPS[idx];

  return (
    <View style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.contentContainer, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
      >
        <TraceHeader statusText={error ? 'SCAN ERROR' : 'SCANNING IN PROGRESS'} statusType={error ? 'idle' : 'active'} />

        <View style={styles.heroSection}>
          <Text style={[Typography.pixelLabel, { color: Colors.accent }]}>LIVE INSPECTION</Text>
          <Text style={[Typography.title2, { color: Colors.ink, marginTop: 4 }]} numberOfLines={1}>
            {(targetUrl || '').replace(/^https?:\/\//, '')}
          </Text>
          <Text style={[Typography.caption, { color: Colors.muted, marginTop: 2 }]}>
            {status.toUpperCase()} · {progressPercent}%
          </Text>
        </View>

        <View style={styles.progressBarBg}>
          <View style={[styles.progressBarFill, { width: `${progressPercent}%` }]} />
        </View>

        <TraceCard style={styles.stepCard}>
          <Text style={[Typography.bodyMedium, { color: Colors.ink, fontWeight: '600' }]}>
            {error ? error : currentStep.title}
          </Text>
          <Text style={[Typography.caption, { color: Colors.muted, marginTop: 4 }]}>
            {error ? 'No fabricated results. TRACE only reports observed data.' : 'Observing a real browser session'}
          </Text>
        </TraceCard>

        <View style={styles.stepList}>
          {SCAN_STEPS.map((step, i) => {
            const isDone = i < idx;
            const isCurrent = i === idx;
            return (
              <View key={step.id} style={styles.stepItem}>
                <Text style={[Typography.pixelLabel, { color: isDone ? Colors.success : isCurrent ? Colors.accent : Colors.border }]}>
                  {isDone ? '[DONE]' : isCurrent ? '[BUSY]' : '[WAIT]'}
                </Text>
                <Text style={[Typography.caption, { color: Colors.ink, marginLeft: Spacing.sm }]}>{step.title}</Text>
              </View>
            );
          })}
        </View>

        <TraceButton
          label="ABORT SCAN"
          variant="ghost"
          onPress={async () => {
            if (scanId) {
              try {
                await api.cancelScan(scanId);
              } catch {
                /* still leave */
              }
            }
            router.back();
          }}
          style={styles.abortBtn}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  scrollView: { flex: 1 },
  contentContainer: { paddingHorizontal: Spacing.xl, paddingTop: Spacing.md },
  heroSection: { marginTop: Spacing.lg, marginBottom: Spacing.md },
  progressBarBg: {
    height: 4,
    backgroundColor: Colors.surface,
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: Spacing.lg,
  },
  progressBarFill: { height: '100%', backgroundColor: Colors.accent },
  stepCard: { padding: Spacing.md, marginBottom: Spacing.lg },
  stepList: {
    backgroundColor: Colors.surface,
    borderRadius: Radii.card,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    marginBottom: Spacing.xl,
  },
  stepItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
  abortBtn: { width: '100%' },
});
