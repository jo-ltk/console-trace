import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, Modal } from 'react-native';
import { Colors } from '../../constants/colors';
import { Spacing } from '../../constants/spacing';
import { Typography } from '../../constants/typography';
import { Radii } from '../../constants/radii';
import { StatusIndicator } from './StatusIndicator';
import { PixelLabel } from './PixelLabel';
import { triggerHaptic } from '../../utils/haptics';

interface TraceHeaderProps {
  statusText?: string;
  statusType?: 'ready' | 'active' | 'warning' | 'error' | 'idle';
  darkSurface?: boolean;
}

export const TraceHeader: React.FC<TraceHeaderProps> = ({
  statusText = 'READY TO INSPECT',
  statusType = 'ready',
  darkSurface = false,
}) => {
  const [tapCount, setTapCount] = useState(0);
  const [easterEggActive, setEasterEggActive] = useState(false);

  const handleWordmarkPress = () => {
    const next = tapCount + 1;
    triggerHaptic('light');
    if (next >= 5) {
      triggerHaptic('success');
      setEasterEggActive(true);
      setTapCount(0);
    } else {
      setTapCount(next);
      // Reset count after 3 seconds if not completed
      setTimeout(() => {
        setTapCount(0);
      }, 3000);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.leftRow}>
        <Pressable
          onPress={handleWordmarkPress}
          accessible={true}
          accessibilityRole="header"
          accessibilityLabel="TRACE production inspector"
        >
          <Text
            style={[
              Typography.brandTitle,
              {
                color: darkSurface ? Colors.white : Colors.ink,
              },
            ]}
          >
            TRACE
          </Text>
        </Pressable>
      </View>

      <View style={styles.rightRow}>
        <StatusIndicator status={statusType} size={7} />
        <Text
          style={[
            Typography.pixelLabel,
            styles.statusLabel,
            {
              color: darkSurface ? Colors.darkMuted : Colors.muted,
            },
          ]}
        >
          {statusText}
        </Text>
      </View>

      {/* Hidden 5-tap Easter Egg modal */}
      <Modal
        visible={easterEggActive}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setEasterEggActive(false)}
      >
        <View style={styles.easterEggBackdrop}>
          <View style={styles.easterEggModal}>
            <View style={styles.terminalHeader}>
              <PixelLabel text="TRACE // INTERNAL" variant="white" />
              <Pressable
                onPress={() => setEasterEggActive(false)}
                style={styles.closeBtn}
              >
                <Text style={{ color: Colors.muted, fontSize: 16 }}>✕</Text>
              </Pressable>
            </View>

            <View style={styles.terminalBody}>
              <Text style={styles.termLine}>&gt; initializing deep observation mode...</Text>
              <Text style={styles.termLine}>&gt; observing observer</Text>
              <Text style={styles.termLine}>&gt; user detected</Text>
              <Text style={[styles.termLine, { color: Colors.scannerGreen }]}>
                &gt; curiosity: 100%
              </Text>
              <Text style={styles.termLine}>
                &gt; system status: suspiciously healthy
              </Text>
              <Text style={[styles.termLine, { color: Colors.mutedLight, marginTop: 12 }]}>
                you found the hidden layer.
              </Text>
            </View>

            <Pressable
              onPress={() => {
                triggerHaptic('light');
                setEasterEggActive(false);
              }}
              style={styles.terminalCloseButton}
            >
              <Text style={styles.terminalCloseText}>RETURN TO SURFACE</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.md,
  },
  leftRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rightRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusLabel: {
    marginLeft: Spacing.xs,
  },
  easterEggBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
  },
  easterEggModal: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#000000',
    borderColor: '#333333',
    borderWidth: 1,
    borderRadius: Radii.card,
    padding: Spacing.xl,
  },
  terminalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: '#222222',
    paddingBottom: Spacing.sm,
  },
  closeBtn: {
    padding: Spacing.xxs,
  },
  terminalBody: {
    paddingVertical: Spacing.sm,
  },
  termLine: {
    fontFamily: Typography.pixelCode.fontFamily,
    fontSize: 12,
    color: '#CCCCCC',
    marginBottom: 6,
    lineHeight: 18,
  },
  terminalCloseButton: {
    marginTop: Spacing.xl,
    backgroundColor: '#1A1A1A',
    borderColor: '#333333',
    borderWidth: 1,
    borderRadius: Radii.button,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
  },
  terminalCloseText: {
    fontFamily: Typography.pixelLabel.fontFamily,
    fontSize: 11,
    letterSpacing: 1,
    color: '#FFFFFF',
  },
});
