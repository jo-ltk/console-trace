import React from 'react';
import { Text, Pressable, ViewStyle, TextStyle } from 'react-native';
import { Colors } from '../../constants/colors';
import { Radii } from '../../constants/radii';
import { Spacing } from '../../constants/spacing';
import { Typography } from '../../constants/typography';
import { triggerHaptic } from '../../utils/haptics';

interface TraceSecondaryButtonProps {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  leftIcon?: React.ReactNode;
  style?: ViewStyle;
  textStyle?: TextStyle;
  darkSurface?: boolean;
}

export const TraceSecondaryButton: React.FC<TraceSecondaryButtonProps> = ({
  label,
  onPress,
  disabled = false,
  leftIcon,
  style,
  textStyle,
  darkSurface = false,
}) => {
  const handlePress = () => {
    if (disabled) return;
    triggerHaptic('light');
    onPress();
  };

  return (
    <Pressable
      onPress={handlePress}
      disabled={disabled}
      accessible={true}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => ({
        backgroundColor: darkSurface ? Colors.darkCard : Colors.surface,
        borderColor: darkSurface ? Colors.darkBorder : Colors.border,
        borderWidth: 1,
        borderRadius: Radii.button,
        height: 48,
        paddingHorizontal: Spacing.lg,
        justifyContent: 'center',
        alignItems: 'center',
        flexDirection: 'row',
        opacity: disabled ? 0.4 : pressed ? 0.85 : 1,
        transform: [{ scale: pressed && !disabled ? 0.98 : 1 }],
        ...style,
      })}
    >
      {leftIcon && <>{leftIcon}</>}
      <Text
        style={[
          Typography.buttonText,
          {
            color: darkSurface ? Colors.white : Colors.ink,
            marginLeft: leftIcon ? Spacing.xs : 0,
          },
          textStyle,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
};
