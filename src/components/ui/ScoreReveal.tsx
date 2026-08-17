import React, { useEffect } from 'react';
import { Modal, View, Text, StyleSheet, Pressable } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedProps,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';
import { Colors } from '../../constants/colors';
import { Spacing } from '../../constants/spacing';
import { Radii } from '../../constants/radii';
import { Typography } from '../../constants/typography';
import type { ScanResult } from '../../types/scan';
import { scoreLabel } from '../../utils/findings';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const RING_SIZE = 168;
const STROKE = 10;
const RADIUS = (RING_SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

interface ScoreRevealProps {
  visible: boolean;
  scan: ScanResult;
  onComplete: () => void;
}

export function ScoreReveal({ visible, scan, onComplete }: ScoreRevealProps) {
  const progress = useSharedValue(0);
  const displayScore = useSharedValue(0);
  const opacity = useSharedValue(0);
  const scale = useSharedValue(0.92);

  const target = scan.healthScore;
  const label = scoreLabel(target);
  const ringColor =
    target >= 90 ? Colors.success : target >= 70 ? Colors.warning : Colors.accent;

  useEffect(() => {
    if (!visible) return;
    progress.value = 0;
    displayScore.value = 0;
    opacity.value = 0;
    scale.value = 0.92;

    opacity.value = withTiming(1, { duration: 220, easing: Easing.out(Easing.cubic) });
    scale.value = withTiming(1, { duration: 420, easing: Easing.out(Easing.cubic) });
    progress.value = withTiming(target / 100, {
      duration: 1400,
      easing: Easing.out(Easing.cubic),
    });
    displayScore.value = withTiming(target, {
      duration: 1400,
      easing: Easing.out(Easing.cubic),
    });

    const timer = setTimeout(() => {
      opacity.value = withTiming(0, { duration: 280 }, (finished) => {
        if (finished) runOnJS(onComplete)();
      });
      scale.value = withTiming(0.98, { duration: 280 });
    }, 1800);

    return () => clearTimeout(timer);
  }, [visible, target]);

  const cardStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  const animatedRingProps = useAnimatedProps(() => ({
    strokeDashoffset: CIRCUMFERENCE * (1 - progress.value),
  }));

  const animatedScoreStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  const critical = scan.findingsSummary?.severity.critical ?? 0;
  const error = scan.findingsSummary?.severity.error ?? 0;
  const warning = scan.findingsSummary?.severity.warning ?? 0;

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onComplete}>
      <Pressable style={styles.backdrop} onPress={onComplete}>
        <Animated.View style={[styles.card, cardStyle]}>
          <Text style={[Typography.pixelLabel, styles.eyebrow]}>SCAN COMPLETE</Text>
          <View style={styles.ringWrap}>
            <Svg width={RING_SIZE} height={RING_SIZE}>
              <Circle
                cx={RING_SIZE / 2}
                cy={RING_SIZE / 2}
                r={RADIUS}
                stroke={Colors.border}
                strokeWidth={STROKE}
                fill="none"
              />
              <AnimatedCircle
                cx={RING_SIZE / 2}
                cy={RING_SIZE / 2}
                r={RADIUS}
                stroke={ringColor}
                strokeWidth={STROKE}
                fill="none"
                strokeLinecap="round"
                strokeDasharray={`${CIRCUMFERENCE} ${CIRCUMFERENCE}`}
                animatedProps={animatedRingProps}
                rotation="-90"
                origin={`${RING_SIZE / 2}, ${RING_SIZE / 2}`}
              />
            </Svg>
            <Animated.View style={[styles.scoreCenter, animatedScoreStyle]}>
              <AnimatedScore value={displayScore} />
              <Text style={[Typography.pixelLabel, { color: Colors.muted, fontSize: 10 }]}>/100</Text>
            </Animated.View>
          </View>
          <Text style={[Typography.headline, { color: ringColor, marginTop: Spacing.sm }]}>{label}</Text>

          <View style={styles.categoryRow}>
            <MiniScore label="Runtime" value={scan.scores?.runtime} />
            <MiniScore label="Network" value={scan.scores?.network} />
            <MiniScore label="A11y" value={scan.scores?.accessibility} />
            <MiniScore label="Security" value={scan.scores?.security} />
          </View>

          <View style={styles.countRow}>
            <CountPill label="CRITICAL" count={critical} color={Colors.accent} />
            <CountPill label="ERROR" count={error} color={Colors.accent} />
            <CountPill label="WARNING" count={warning} color={Colors.warning} />
          </View>

          <Text style={[Typography.caption, { color: Colors.muted, marginTop: Spacing.md, textAlign: 'center' }]}>
            Tap anywhere to view the full report
          </Text>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

function AnimatedScore({ value }: { value: SharedValue<number> }) {
  const [shown, setShown] = React.useState(0);
  useAnimatedReaction(
    () => Math.round(value.value),
    (current) => {
      runOnJS(setShown)(current);
    },
  );
  return (
    <Text style={[Typography.pixelScore, { color: Colors.ink, fontSize: 44 }]}>
      {shown}
    </Text>
  );
}

function MiniScore({ label, value }: { label: string; value?: number }) {
  return (
    <View style={styles.miniScore}>
      <Text style={[Typography.pixelLabel, { color: Colors.muted, fontSize: 8 }]}>{label}</Text>
      <Text style={[Typography.pixelLabel, { color: Colors.ink }]}>{value ?? '—'}</Text>
    </View>
  );
}

function CountPill({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <View style={styles.countPill}>
      <Text style={[Typography.pixelScore, { color, fontSize: 18 }]}>{count}</Text>
      <Text style={[Typography.pixelLabel, { color: Colors.muted, fontSize: 8 }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(28, 25, 23, 0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: Colors.white,
    borderRadius: Radii.card,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.xl,
    alignItems: 'center',
  },
  eyebrow: {
    color: Colors.muted,
    letterSpacing: 1.4,
    marginBottom: Spacing.md,
  },
  ringWrap: {
    width: RING_SIZE,
    height: RING_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreCenter: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.lg,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  miniScore: {
    minWidth: 64,
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: Radii.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
  },
  countRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  countPill: {
    alignItems: 'center',
    minWidth: 72,
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    backgroundColor: Colors.surface,
    borderRadius: Radii.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
});
