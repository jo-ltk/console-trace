import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Switch,
  TouchableOpacity,
  Platform,
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
import { TraceSecondaryButton } from '../../components/ui/TraceSecondaryButton';
import { triggerHaptic } from '../../utils/haptics';
import { useAppStore } from '../../stores/useAppStore';

export default function ScanConfigureScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ url?: string; display?: string }>();

  const currentConfig = useAppStore((s) => s.currentConfig);
  const updateConfig = useAppStore((s) => s.updateConfig);

  const targetUrl = params.url || currentConfig.url || 'https://example.com';
  const displayUrl = params.display || targetUrl.replace(/^https?:\/\//, '');

  const [options, setOptions] = useState(currentConfig.options);
  const [interactionDepth, setInteractionDepth] = useState<'minimal' | 'standard' | 'deep'>(
    currentConfig.advanced.interactionDepth
  );
  const [maxPages, setMaxPages] = useState<number>(currentConfig.advanced.maxPages);
  const [device, setDevice] = useState<'mobile' | 'desktop'>(currentConfig.advanced.device);

  const toggleOption = (key: keyof typeof options) => {
    triggerHaptic('light');
    setOptions((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleStartInspection = () => {
    triggerHaptic('impact');
    updateConfig((prev) => ({
      ...prev,
      url: targetUrl,
      options,
      advanced: {
        maxPages,
        interactionDepth,
        device,
      },
    }));

    router.push({
      pathname: '/scan/progress' as any,
      params: { url: targetUrl },
    });
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.contentContainer,
          { paddingBottom: insets.bottom + 100 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <TraceHeader statusText="CONFIGURE AUDIT" statusType="ready" />

        <View style={styles.targetBanner}>
          <Text style={[Typography.pixelLabel, { color: Colors.accent }]}>TARGET URL</Text>
          <Text style={[Typography.headline, { color: Colors.ink, marginTop: 4 }]} numberOfLines={1}>
            {displayUrl}
          </Text>
        </View>

        {/* Observation Modules */}
        <View style={styles.section}>
          <Text style={[Typography.pixelLabel, styles.sectionTitle]}>TELEMETRY MODULES</Text>

          <TraceCard style={styles.card}>
            <OptionRow
              title="Console Logs & Noise"
              desc="Captures console.log, info, warnings & debug dumps"
              value={options.consoleOutput}
              onToggle={() => toggleOption('consoleOutput')}
            />
            <View style={styles.divider} />
            <OptionRow
              title="Runtime JavaScript Errors"
              desc="Uncaught exceptions, broken promises & type errors"
              value={options.jsErrors}
              onToggle={() => toggleOption('jsErrors')}
            />
            <View style={styles.divider} />
            <OptionRow
              title="Network & API Failures"
              desc="Detects 4xx/5xx HTTP responses & sluggish endpoints"
              value={options.networkFailures}
              onToggle={() => toggleOption('networkFailures')}
            />
            <View style={styles.divider} />
            <OptionRow
              title="Broken Static Assets"
              desc="Missing images, scripts, stylesheet 404s & font fails"
              value={options.brokenAssets}
              onToggle={() => toggleOption('brokenAssets')}
            />
            <View style={styles.divider} />
            <OptionRow
              title="Performance & Core Web Vitals"
              desc="LCP, FCP, CLS, TTFB load benchmarks"
              value={options.performance}
              onToggle={() => toggleOption('performance')}
            />
          </TraceCard>
        </View>

        {/* Depth & Crawler Settings */}
        <View style={styles.section}>
          <Text style={[Typography.pixelLabel, styles.sectionTitle]}>CRAWL CONFIGURATION</Text>

          <TraceCard style={styles.card}>
            <View style={styles.rowBetween}>
              <View>
                <Text style={[Typography.bodyMedium, { color: Colors.ink }]}>Device Emulation</Text>
                <Text style={[Typography.caption, { color: Colors.muted, marginTop: 2 }]}>
                  User agent and viewport sizing
                </Text>
              </View>
              <View style={styles.segmentedControl}>
                <TouchableOpacity
                  style={[styles.segmentBtn, device === 'mobile' && styles.segmentActive]}
                  onPress={() => {
                    triggerHaptic('light');
                    setDevice('mobile');
                  }}
                >
                  <Text style={[styles.segmentText, device === 'mobile' && styles.segmentTextActive]}>
                    Mobile
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.segmentBtn, device === 'desktop' && styles.segmentActive]}
                  onPress={() => {
                    triggerHaptic('light');
                    setDevice('desktop');
                  }}
                >
                  <Text style={[styles.segmentText, device === 'desktop' && styles.segmentTextActive]}>
                    Desktop
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.divider} />

            <View style={styles.rowBetween}>
              <View>
                <Text style={[Typography.bodyMedium, { color: Colors.ink }]}>Max Pages to Crawl</Text>
                <Text style={[Typography.caption, { color: Colors.muted, marginTop: 2 }]}>
                  Link discovery depth
                </Text>
              </View>
              <View style={styles.segmentedControl}>
                {[1, 3, 5].map((num) => (
                  <TouchableOpacity
                    key={num}
                    style={[styles.segmentBtn, maxPages === num && styles.segmentActive]}
                    onPress={() => {
                      triggerHaptic('light');
                      setMaxPages(num);
                    }}
                  >
                    <Text style={[styles.segmentText, maxPages === num && styles.segmentTextActive]}>
                      {num} {num === 1 ? 'page' : 'pgs'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </TraceCard>
        </View>

        {/* Action Buttons */}
        <View style={styles.actionContainer}>
          <TraceButton
            label="LAUNCH LIVE SCAN"
            onPress={handleStartInspection}
            size="lg"
            style={styles.primaryBtn}
          />
          <TraceSecondaryButton
            label="Cancel"
            onPress={() => router.back()}
            style={styles.cancelBtn}
          />
        </View>
      </ScrollView>
    </View>
  );
}

function OptionRow({
  title,
  desc,
  value,
  onToggle,
}: {
  title: string;
  desc: string;
  value: boolean;
  onToggle: () => void;
}) {
  return (
    <View style={styles.optionRow}>
      <View style={{ flex: 1, paddingRight: Spacing.md }}>
        <Text style={[Typography.bodyMedium, { color: Colors.ink }]}>{title}</Text>
        <Text style={[Typography.caption, { color: Colors.muted, marginTop: 2 }]}>{desc}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onToggle}
        trackColor={{ false: Colors.border, true: Colors.accent }}
        thumbColor={Platform.OS === 'android' ? Colors.white : undefined}
      />
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
  targetBanner: {
    marginVertical: Spacing.lg,
    padding: Spacing.lg,
    backgroundColor: Colors.surface,
    borderRadius: Radii.card,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  section: {
    marginBottom: Spacing.xl,
  },
  sectionTitle: {
    color: Colors.muted,
    marginBottom: Spacing.sm,
    letterSpacing: 1.2,
  },
  card: {
    padding: Spacing.md,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.xs,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: Spacing.sm,
  },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.xs,
  },
  segmentedControl: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderRadius: Radii.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 2,
  },
  segmentBtn: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    borderRadius: Radii.sm - 2,
  },
  segmentActive: {
    backgroundColor: Colors.ink,
  },
  segmentText: {
    fontSize: 11,
    fontFamily: Typography.pixelLabel.fontFamily,
    color: Colors.muted,
  },
  segmentTextActive: {
    color: Colors.white,
    fontWeight: '600',
  },
  actionContainer: {
    marginTop: Spacing.md,
  },
  primaryBtn: {
    width: '100%',
    marginBottom: Spacing.sm,
  },
  cancelBtn: {
    width: '100%',
  },
});
