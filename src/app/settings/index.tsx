import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
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

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const clearHistory = useAppStore((s) => s.clearHistory);

  return (
    <View style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.contentContainer, { paddingBottom: insets.bottom + 96 }]}
        showsVerticalScrollIndicator={false}
      >
        <TraceHeader statusText="PREFERENCES" statusType="idle" />

        <View style={styles.hero}>
          <Text style={[Typography.title1, { color: Colors.ink }]}>Settings</Text>
          <Text style={[Typography.bodySmall, { color: Colors.muted, marginTop: 4 }]}>
            Configure scanner defaults, notification triggers, and cache management.
          </Text>
        </View>

        {/* Scan Defaults */}
        <View style={styles.section}>
          <Text style={[Typography.pixelLabel, styles.sectionTitle]}>SCAN DEFAULTS</Text>
          <TraceCard style={styles.card}>
            <View style={styles.row}>
              <Text style={[Typography.body, { color: Colors.ink }]}>Default Device</Text>
              <Text style={[Typography.caption, { color: Colors.muted }]}>Mobile</Text>
            </View>
            <View style={[styles.row, { borderTopWidth: 1, borderTopColor: Colors.border, marginTop: 12, paddingTop: 12 }]}>
              <Text style={[Typography.body, { color: Colors.ink }]}>Page Limit</Text>
              <Text style={[Typography.caption, { color: Colors.muted }]}>5 pages</Text>
            </View>
          </TraceCard>
        </View>

        {/* Data & History */}
        <View style={styles.section}>
          <Text style={[Typography.pixelLabel, styles.sectionTitle]}>DATA</Text>
          <TraceCard style={styles.card}>
            <Text style={[Typography.bodySmall, { color: Colors.muted, marginBottom: 12 }]}>
              Reset your locally stored scan logs, diagnostic cache, and history.
            </Text>
            <TraceButton
              label="CLEAR SCAN HISTORY"
              variant="outline"
              size="sm"
              onPress={() => clearHistory()}
            />
          </TraceCard>
        </View>

        {/* About */}
        <View style={styles.section}>
          <Text style={[Typography.pixelLabel, styles.sectionTitle]}>ABOUT</Text>
          <TraceCard style={styles.card}>
            <View style={styles.row}>
              <Text style={[Typography.body, { color: Colors.ink }]}>TRACE Engine</Text>
              <Text style={[Typography.caption, { color: Colors.muted }]}>v1.0.0-rc2</Text>
            </View>
            <View style={[styles.row, { borderTopWidth: 1, borderTopColor: Colors.border, marginTop: 12, paddingTop: 12 }]}>
              <Text style={[Typography.body, { color: Colors.ink }]}>Architecture</Text>
              <Text style={[Typography.caption, { color: Colors.muted }]}>Black-box Observer</Text>
            </View>
          </TraceCard>
        </View>
      </ScrollView>

      <BottomNavigation />
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
  },
  hero: {
    marginVertical: Spacing.xl,
  },
  section: {
    marginBottom: Spacing.xl,
  },
  sectionTitle: {
    color: Colors.muted,
    marginBottom: Spacing.sm,
  },
  card: {
    padding: Spacing.lg,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
});
