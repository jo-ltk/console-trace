import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../constants/colors';
import { Spacing } from '../constants/spacing';
import { Radii } from '../constants/radii';
import { Typography } from '../constants/typography';
import { TraceButton } from '../components/ui/TraceButton';
import { TraceSecondaryButton } from '../components/ui/TraceSecondaryButton';
import { TraceCard } from '../components/ui/TraceCard';
import { PixelLabel } from '../components/ui/PixelLabel';
import { triggerHaptic } from '../utils/haptics';
import { useAppStore } from '../stores/useAppStore';

export default function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const setHasCompletedOnboarding = useAppStore((s) => s.setHasCompletedOnboarding);

  const handleComplete = () => {
    triggerHaptic('success');
    setHasCompletedOnboarding(true);
    router.replace('/');
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        {/* Minimal Wordmark */}
        <View style={styles.header}>
          <Text style={[Typography.brandTitle, { color: Colors.ink }]}>TRACE</Text>
          <PixelLabel text="v1.0.0" variant="dim" />
        </View>

        {/* Hero */}
        <View style={styles.heroSection}>
          <Text style={[Typography.heroTitle, styles.headline]}>
            Your website has secrets.
          </Text>
          <Text style={[Typography.body, styles.subhead]}>
            TRACE observes what real users and search spiders actually experience when your production website runs.
          </Text>
        </View>

        {/* Feature Pillars (CONSOLE · RUNTIME · NETWORK) */}
        <View style={styles.pillarsContainer}>
          <TraceCard style={styles.pillarCard}>
            <View style={styles.pillarHeader}>
              <PixelLabel text="CONSOLE" variant="normal" />
              <Text style={styles.pillarBadge}>OBSERVE</Text>
            </View>
            <Text style={[Typography.bodySmall, styles.pillarDesc]}>
              Catches silent console.error, deprecation warnings, and stray telemetry noise before your users notice.
            </Text>
          </TraceCard>

          <TraceCard style={styles.pillarCard}>
            <View style={styles.pillarHeader}>
              <PixelLabel text="RUNTIME" variant="normal" />
              <Text style={styles.pillarBadge}>CATCH</Text>
            </View>
            <Text style={[Typography.bodySmall, styles.pillarDesc]}>
              Detects unhandled JavaScript exceptions, broken promises, and undefined property crashes with precise stacktraces.
            </Text>
          </TraceCard>

          <TraceCard style={styles.pillarCard}>
            <View style={styles.pillarHeader}>
              <PixelLabel text="NETWORK" variant="normal" />
              <Text style={styles.pillarBadge}>INSPECT</Text>
            </View>
            <Text style={[Typography.bodySmall, styles.pillarDesc]}>
              Flags 4xx/5xx HTTP failures, sluggish API endpoints, and broken assets across every route.
            </Text>
          </TraceCard>
        </View>

        {/* Action Buttons */}
        <View style={styles.actionContainer}>
          <TraceButton
            label="START INSPECTING"
            onPress={handleComplete}
            size="lg"
            style={styles.primaryBtn}
          />
          <TraceSecondaryButton
            label="Skip Introduction"
            onPress={handleComplete}
            style={styles.skipBtn}
          />
        </View>
      </ScrollView>
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
    paddingVertical: Spacing.lg,
    flexGrow: 1,
    justifyContent: 'space-between',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.xl,
  },
  heroSection: {
    marginBottom: Spacing.xxl,
  },
  headline: {
    color: Colors.ink,
    marginBottom: Spacing.md,
  },
  subhead: {
    color: Colors.muted,
    lineHeight: 24,
  },
  pillarsContainer: {
    marginBottom: Spacing.xxl,
  },
  pillarCard: {
    marginBottom: Spacing.md,
  },
  pillarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  pillarBadge: {
    fontSize: 9,
    fontFamily: Typography.pixelLabel.fontFamily,
    color: Colors.muted,
    backgroundColor: Colors.surface,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: Radii.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  pillarDesc: {
    color: Colors.muted,
    lineHeight: 20,
  },
  actionContainer: {
    marginTop: Spacing.lg,
  },
  primaryBtn: {
    width: '100%',
    marginBottom: Spacing.sm,
  },
  skipBtn: {
    width: '100%',
  },
});
