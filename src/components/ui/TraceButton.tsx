import React from 'react';
import {
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  ViewStyle,
  TextStyle,
} from 'react-native';
import { Colors } from '../../constants/colors';
import { Radii } from '../../constants/radii';
import { Spacing } from '../../constants/spacing';
import { Typography } from '../../constants/typography';
import { triggerHaptic } from '../../utils/haptics';

interface TraceButtonProps {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'dark' | 'outline' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  disabled?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  style?: ViewStyle;
  textStyle?: TextStyle;
}

export const TraceButton: React.FC<TraceButtonProps> = ({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  leftIcon,
  rightIcon,
  style,
  textStyle,
}) => {
  const handlePress = () => {
    if (disabled || loading) return;
    triggerHaptic('light');
    onPress();
  };

  const getContainerStyle = (pressed: boolean): ViewStyle => {
    let bg: string = Colors.primary;
    let border: string = Colors.primary;

    if (variant === 'dark') {
      bg = Colors.darkCard;
      border = Colors.darkBorder;
    } else if (variant === 'outline' || variant === 'ghost') {
      bg = 'transparent';
      border = Colors.border;
    } else if (variant === 'danger') {
      bg = Colors.error;
      border = Colors.error;
    }

    if (disabled) {
      bg = Colors.surface;
      border = Colors.border;
    }

    const sizePadding =
      size === 'sm'
        ? { paddingVertical: Spacing.xs, paddingHorizontal: Spacing.md, height: 38 }
        : size === 'lg'
        ? { paddingVertical: Spacing.md, paddingHorizontal: Spacing.xl, height: 56 }
        : { paddingVertical: Spacing.sm, paddingHorizontal: Spacing.lg, height: 48 };

    return {
      backgroundColor: bg,
      borderColor: border,
      borderWidth: 1,
      borderRadius: Radii.button,
      justifyContent: 'center',
      alignItems: 'center',
      flexDirection: 'row',
      opacity: disabled ? 0.5 : pressed ? 0.92 : 1,
      transform: [{ scale: pressed && !disabled ? 0.98 : 1 }],
      ...sizePadding,
      ...style,
    };
  };

  const getTextColor = (): TextStyle => {
    if (disabled) return { color: Colors.muted };
    if (variant === 'outline' || variant === 'ghost') return { color: Colors.ink };
    return { color: Colors.white };
  };

  return (
    <Pressable
      onPress={handlePress}
      disabled={disabled || loading}
      accessible={true}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => getContainerStyle(pressed)}
    >
      {loading ? (
        <ActivityIndicator
          size="small"
          color={variant === 'outline' || variant === 'ghost' ? Colors.ink : Colors.white}
        />
      ) : (
        <>
          {leftIcon && <>{leftIcon}</>}
          <Text
            style={[
              Typography.buttonText,
              getTextColor(),
              leftIcon ? { marginLeft: Spacing.xs } : undefined,
              rightIcon ? { marginRight: Spacing.xs } : undefined,
              textStyle,
            ]}
          >
            {label}
          </Text>
          {rightIcon && <>{rightIcon}</>}
        </>
      )}
    </Pressable>
  );
};
