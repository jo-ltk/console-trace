import React from 'react';
import { View, StyleSheet, ViewStyle, Pressable } from 'react-native';
import { Colors } from '../../constants/colors';
import { Radii } from '../../constants/radii';
import { Spacing } from '../../constants/spacing';
import { triggerHaptic } from '../../utils/haptics';

interface TraceCardProps {
  children: React.ReactNode;
  onPress?: () => void;
  variant?: 'light' | 'dark' | 'surface';
  style?: ViewStyle;
  padded?: boolean;
}

export const TraceCard: React.FC<TraceCardProps> = ({
  children,
  onPress,
  variant = 'light',
  style,
  padded = true,
}) => {
  const isDark = variant === 'dark';
  const isSurface = variant === 'surface';

  const containerStyle: ViewStyle = {
    backgroundColor: isDark
      ? Colors.darkCard
      : isSurface
      ? Colors.surface
      : Colors.surfaceCard,
    borderColor: isDark ? Colors.darkBorder : Colors.border,
    borderWidth: 1,
    borderRadius: Radii.card,
    padding: padded ? Spacing.lg : 0,
    overflow: 'hidden',
  };

  if (onPress) {
    return (
      <Pressable
        onPress={() => {
          triggerHaptic('light');
          onPress();
        }}
        style={({ pressed }) => [
          containerStyle,
          {
            transform: [{ scale: pressed ? 0.985 : 1 }],
            opacity: pressed ? 0.9 : 1,
          },
          style,
        ]}
      >
        {children}
      </Pressable>
    );
  }

  return <View style={[containerStyle, style]}>{children}</View>;
};
