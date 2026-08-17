import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Platform } from 'react-native';
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
import { pollScanStatus } from '../../utils/poll-scan-status';

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

const TERMINAL = new Set(['completed', 'completed_with_warnings', 'failed', 'cancelled']);

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
  const [scanFailed, setScanFailed] = useState(false);
  const [failureReason, setFailureReason] = useState<string | null>(null);
  const [pollError, setPollError] = useState<string | null>(null);
  const [scanId, setScanId] = useState<string | null>(null);
  const [retryToken, setRetryToken] = useState(0);
  const cancelledRef = useRef(false);

  useEffect(() => {
    cancelledRef.current = false;

    const finishSuccess = async (id: string) => {
      const raw = await api.getResults(id);
      const mapped = toClientScan(raw as Record<string, unknown>);
      addRecentScan(mapped);
      triggerHaptic('success');
      router.replace({ pathname: '/report' as any, params: { id: mapped.id, reveal: '1' } });
    };

    const run = async () => {
      if (!targetUrl) {
        setScanFailed(true);
        setFailureReason('No target URL');
        return;
      }

      setScanFailed(false);
      setFailureReason(null);
      setPollError(null);
      setStatus('queued');

      try {
        const created = await api.createScan(targetUrl, {
          maxPages: currentConfig.advanced.maxPages,
          maxDepth:
            currentConfig.advanced.interactionDepth === 'deep'
              ? 4
              : currentConfig.advanced.interactionDepth === 'minimal'
                ? 1
                : 3,
          device: currentConfig.advanced.device,
          accessibility: currentConfig.options.accessibility,
          performance: currentConfig.options.performance,
          security: true,
          interactions: currentConfig.advanced.interactionDepth !== 'minimal',
        });

        if (cancelledRef.current) return;

        setScanId(created.scanId);
        setActiveScanId(created.scanId);
        setStatus(created.status);

        let terminalHandled = false;

        const handleTerminal = async (st: { status: string; statusReason?: string }) => {
          if (cancelledRef.current || terminalHandled) return;
          setStatus(st.status);
          setPollError(null);

          if (st.status === 'failed') {
            terminalHandled = true;
            setScanFailed(true);
            setFailureReason(st.statusReason || 'Scan failed');
            triggerHaptic('error');
            return;
          }
          if (st.status === 'cancelled') {
            terminalHandled = true;
            router.back();
            return;
          }
          if (TERMINAL.has(st.status)) {
            terminalHandled = true;
            await finishSuccess(created.scanId);
          }
        };

        const unsubscribeSse =
          Platform.OS === 'web'
            ? api.subscribeScanEvents(
                created.scanId,
                (payload) => {
                  void handleTerminal(payload);
                },
                () => {
                  /* polling continues as fallback */
                },
              )
            : () => undefined;

        try {
          await pollScanStatus({
            scanId: created.scanId,
            shouldCancel: () => cancelledRef.current || terminalHandled,
            onStatus: (st) => {
              setStatus(st.status);
              setPollError(null);
              if (TERMINAL.has(st.status)) {
                void handleTerminal(st);
              }
            },
            onError: (err, failures) => {
              if (failures >= 2) {
                setPollError(err.message);
              }
            },
            intervalMs: 2500,
            maxFailures: 40,
          });
        } catch (err) {
          if (!cancelledRef.current && !terminalHandled) {
            setScanFailed(true);
            setFailureReason((err as Error).message);
            triggerHaptic('error');
          }
        } finally {
          unsubscribeSse();
        }
      } catch (e) {
        if (!cancelledRef.current) {
          setScanFailed(true);
          setFailureReason((e as Error).message);
          triggerHaptic('error');
        }
      }
    };

    run();
    return () => {
      cancelledRef.current = true;
    };
  }, [targetUrl, retryToken]);

  const idx = stepIndex(status);
  const progressPercent = Math.round(((idx + 1) / SCAN_STEPS.length) * 100);
  const currentStep = SCAN_STEPS[idx];
  const headerStatus = scanFailed ? 'SCAN FAILED' : 'SCANNING';
  const headerType = scanFailed ? 'error' : 'active';

  return (
    <View style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.contentContainer, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
      >
        <TraceHeader statusText={headerStatus} statusType={headerType} />

        <View style={styles.heroSection}>
          <Text style={[Typography.pixelLabel, { color: Colors.accent }]}>LIVE INSPECTION</Text>
          <Text style={[Typography.title2, { color: Colors.ink, marginTop: 4 }]} numberOfLines={1}>
            {(targetUrl || '').replace(/^https?:\/\//, '')}
          </Text>
          <Text style={[Typography.caption, { color: Colors.muted, marginTop: 2 }]}>
            {scanFailed ? 'FAILED' : status.toUpperCase()} · {progressPercent}%
          </Text>
        </View>

        <View style={styles.progressBarBg}>
          <View style={[styles.progressBarFill, { width: `${progressPercent}%` }]} />
        </View>

        <TraceCard style={styles.stepCard}>
          <Text style={[Typography.bodyMedium, { color: Colors.ink, fontWeight: '600' }]}>
            {scanFailed ? failureReason : pollError ? 'Reconnecting to scan status…' : currentStep.title}
          </Text>
          <Text style={[Typography.caption, { color: Colors.muted, marginTop: 4 }]}>
            {scanFailed
              ? 'The scan could not complete. No fabricated results — TRACE only reports observed data.'
              : pollError
                ? `Temporary connection issue: ${pollError}`
                : 'Observing a real browser session'}
          </Text>
        </TraceCard>

        <View style={styles.stepList}>
          {SCAN_STEPS.map((step, i) => {
            const isDone = i < idx;
            const isCurrent = i === idx;
            return (
              <View key={step.id} style={styles.stepItem}>
                <Text
                  style={[
                    Typography.pixelLabel,
                    { color: isDone ? Colors.success : isCurrent ? Colors.accent : Colors.border },
                  ]}
                >
                  {isDone ? '[DONE]' : isCurrent ? '[BUSY]' : '[WAIT]'}
                </Text>
                <Text style={[Typography.caption, { color: Colors.ink, marginLeft: Spacing.sm }]}>
                  {step.title}
                </Text>
              </View>
            );
          })}
        </View>

        {scanFailed && (
          <TraceButton
            label="RETRY CONNECTION"
            onPress={() => {
              triggerHaptic('light');
              setRetryToken((t) => t + 1);
            }}
            style={styles.retryBtn}
          />
        )}

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
  retryBtn: { width: '100%', marginBottom: Spacing.sm },
  abortBtn: { width: '100%' },
});
