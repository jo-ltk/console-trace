import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Colors } from '../../constants/colors';
import { Radii } from '../../constants/radii';
import { Spacing } from '../../constants/spacing';
import { Typography } from '../../constants/typography';
import { triggerHaptic } from '../../utils/haptics';

interface TraceChipProps {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  count?: number;
  variant?: 'light' | 'dark';
}

export const TraceChip: React.FC<TraceChipProps> = ({
  label,
  selected = false,
  onPress,
  count,
  variant = 'light',
}) => {
  const isDark = variant === 'dark';

  return (
    <Pressable
      onPress={() => {
        if (onPress) {
          triggerHaptic('light');
          onPress();
        }
      }}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: selected
            ? isDark
              ? Colors.white
              : Colors.ink
            : isDark
            ? Colors.darkCard
            : Colors.surface,
          borderColor: selected
            ? isDark
              ? Colors.white
              : Colors.ink
            : isDark
            ? Colors.darkBorder
            : Colors.border,
          opacity: pressed ? 0.8 : 1,
          transform: [{ scale: pressed ? 0.97 : 1 }],
        },
      ]}
    >
      <Text
        style={[
          Typography.caption,
          {
            color: selected
              ? isDark
                ? Colors.ink
                : Colors.white
              : isDark
              ? Colors.darkMuted
              : Colors.ink,
            fontWeight: selected ? '700' : '500',
          },
        ]}
      >
        {label}
      </Text>

      {count !== undefined && (
        <View
          style={[
            styles.badge,
            {
              backgroundColor: selected
                ? isDark
                  ? Colors.ink
                  : Colors.white
                : isDark
                ? Colors.darkBorder
                : Colors.border,
            },
          ]}
        >
          <Text
            style={[
              Typography.caption,
              {
                fontSize: 10,
                color: selected
                  ? isDark
                    ? Colors.white
                    : Colors.ink
                  : isDark
                  ? Colors.white
                  : Colors.ink,
              },
            ]}
          >
            {count}
          </Text>
        </View>
      )}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: Radii.chip,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    marginLeft: Spacing.xs,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: Radii.sm,
  },
});
