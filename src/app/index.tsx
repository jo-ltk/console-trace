import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../constants/colors';
import { Spacing } from '../constants/spacing';
import { Radii } from '../constants/radii';
import { Typography } from '../constants/typography';
import { TraceHeader } from '../components/ui/TraceHeader';
import { TraceInput } from '../components/ui/TraceInput';
import { TraceButton } from '../components/ui/TraceButton';
import { TraceCard } from '../components/ui/TraceCard';
import { PixelLabel } from '../components/ui/PixelLabel';
import { BottomNavigation } from '../components/ui/BottomNavigation';
import { validateAndNormalizeUrl } from '../utils/url';
import { triggerHaptic } from '../utils/haptics';
import { useAppStore } from '../stores/useAppStore';

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [urlInput, setUrlInput] = useState('');
  const [urlError, setUrlError] = useState<string | undefined>();
  const recentScans = useAppStore((s) => s.recentScans);
  const updateConfig = useAppStore((s) => s.updateConfig);

  const handleStartScan = (overrideUrl?: string) => {
    const targetUrl = overrideUrl || urlInput;
    const validation = validateAndNormalizeUrl(targetUrl);

    if (!validation.isValid) {
      setUrlError(validation.error);
      triggerHaptic('error');
      return;
    }

    setUrlError(undefined);
    triggerHaptic('light');

    updateConfig((prev) => ({
      ...prev,
      url: validation.normalizedUrl,
    }));

    router.push({
      pathname: '/scan/configure' as any,
      params: { url: validation.normalizedUrl, display: validation.displayUrl },
    });
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardView}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[
            styles.contentContainer,
            { paddingBottom: insets.bottom + 96 },
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header */}
          <TraceHeader statusText="READY TO INSPECT" statusType="ready" />

          {/* Hero Section */}
          <View style={styles.heroSection}>
            <Text style={[Typography.heroTitle, styles.heroHeadline]}>
              What should we inspect?
            </Text>
            <Text style={[Typography.bodySmall, styles.heroSub]}>
              Enter any public production web address. TRACE observes what happens at runtime.
            </Text>
          </View>

          {/* URL Input Box */}
          <View style={styles.inputBox}>
            <TraceInput
              value={urlInput}
              onChangeText={(val) => {
                setUrlInput(val);
                if (urlError) setUrlError(undefined);
              }}
              placeholder="https://example.com"
              error={urlError}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              returnKeyType="go"
              onSubmitEditing={() => handleStartScan()}
              rightAction={
                urlInput ? (
                  <Pressable
                    onPress={() => setUrlInput('')}
                    hitSlop={8}
                    style={styles.clearBtn}
                  >
                    <Text style={{ color: Colors.muted, fontSize: 13 }}>✕</Text>
                  </Pressable>
                ) : null
              }
            />

            <View style={styles.buttonRow}>
              <TraceButton
                label="SCAN WEBSITE"
                onPress={() => handleStartScan()}
                size="lg"
                style={styles.scanBtn}
              />
            </View>
          </View>

          {/* Quick Scan Badges */}
          <View style={styles.quickScanSection}>
            <Text style={[Typography.pixelLabel, styles.sectionLabel]}>
              QUICK SCAN
            </Text>
            <Text style={[Typography.caption, styles.quickScanText]}>
              Console · Runtime · Network
            </Text>
          </View>

          {/* Recent Scans Section */}
          <View style={styles.recentSection}>
            <View style={styles.recentHeader}>
              <Text style={[Typography.pixelLabel, styles.sectionLabel]}>
                RECENT OBSERVATIONS
              </Text>
              {recentScans.length > 0 && (
                <Text style={[Typography.caption, { color: Colors.muted }]}>
                  {recentScans.length} recorded
                </Text>
              )}
            </View>

            {recentScans.length === 0 ? (
              <TraceCard variant="surface" style={styles.emptyCard}>
                <Text style={[Typography.headline, { color: Colors.ink, marginBottom: 4 }]}>
                  Nothing observed yet.
                </Text>
                <Text style={[Typography.bodySmall, { color: Colors.muted }]}>
                  Run your first inspection above to build a diagnostic baseline.
                </Text>
              </TraceCard>
            ) : (
              recentScans.slice(0, 3).map((scan) => (
                <TraceCard
                  key={scan.id}
                  style={styles.recentCard}
                  onPress={() => {
                    router.push({
                      pathname: '/report' as any,
                      params: { id: scan.id },
                    });
                  }}
                >
                  <View style={styles.recentCardContent}>
                    <View style={styles.recentLeft}>
                      <Text style={[Typography.headline, { color: Colors.ink }]}>
                        {scan.normalizedUrl.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                      </Text>
                      <Text style={[Typography.caption, { color: Colors.muted, marginTop: 4 }]}>
                        {scan.startedAt} · {scan.pagesScanned} pages
                      </Text>
                    </View>

                    <View style={styles.scoreBadge}>
                      <Text style={[Typography.pixelScore, { color: Colors.ink }]}>
                        {scan.healthScore}
                      </Text>
                      <Text
                        style={[
                          Typography.pixelLabel,
                          { color: Colors.muted, fontSize: 9, marginLeft: 2 },
                        ]}
                      >
                        /100
                      </Text>
                    </View>
                  </View>
                </TraceCard>
              ))
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Floating Bottom Navigation */}
      <BottomNavigation />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  keyboardView: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: Spacing.xl,
  },
  heroSection: {
    marginTop: Spacing.xxl,
    marginBottom: Spacing.xl,
  },
  heroHeadline: {
    color: Colors.ink,
    marginBottom: Spacing.xs,
  },
  heroSub: {
    color: Colors.muted,
    lineHeight: 20,
  },
  inputBox: {
    marginBottom: Spacing.xl,
  },
  clearBtn: {
    padding: Spacing.xxs,
  },
  buttonRow: {
    marginTop: Spacing.md,
  },
  scanBtn: {
    width: '100%',
  },
  quickScanSection: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    backgroundColor: Colors.surface,
    borderRadius: Radii.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: Spacing.xxl,
  },
  sectionLabel: {
    color: Colors.muted,
  },
  quickScanText: {
    color: Colors.ink,
    fontWeight: '500',
  },
  recentSection: {
    marginBottom: Spacing.xl,
  },
  recentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  recentCard: {
    marginBottom: Spacing.sm,
  },
  recentCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  recentLeft: {
    flex: 1,
    marginRight: Spacing.md,
  },
  scoreBadge: {
    flexDirection: 'row',
    alignItems: 'baseline',
    backgroundColor: Colors.surface,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: Radii.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  emptyCard: {
    padding: Spacing.xl,
    alignItems: 'center',
    textAlign: 'center',
  },
});
