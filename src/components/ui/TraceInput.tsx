import React, { useState } from 'react';
import {
  View,
  TextInput,
  Text,
  StyleSheet,
  Pressable,
  ViewStyle,
  TextInputProps,
} from 'react-native';
import { Colors } from '../../constants/colors';
import { Radii } from '../../constants/radii';
import { Spacing } from '../../constants/spacing';
import { Typography } from '../../constants/typography';

interface TraceInputProps extends TextInputProps {
  label?: string;
  error?: string;
  leftPrefix?: string;
  rightAction?: React.ReactNode;
  containerStyle?: ViewStyle;
  darkSurface?: boolean;
}

export const TraceInput: React.FC<TraceInputProps> = ({
  label,
  error,
  leftPrefix,
  rightAction,
  containerStyle,
  darkSurface = false,
  value,
  onChangeText,
  placeholder,
  ...props
}) => {
  const [isFocused, setIsFocused] = useState(false);

  return (
    <View style={[styles.wrapper, containerStyle]}>
      {label && (
        <Text
          style={[
            Typography.caption,
            {
              color: darkSurface ? Colors.darkMuted : Colors.muted,
              marginBottom: Spacing.xs,
              textTransform: 'uppercase',
              letterSpacing: 0.8,
            },
          ]}
        >
          {label}
        </Text>
      )}

      <View
        style={[
          styles.inputContainer,
          {
            backgroundColor: darkSurface ? Colors.darkCard : Colors.white,
            borderColor: error
              ? Colors.error
              : isFocused
              ? darkSurface
                ? Colors.white
                : Colors.ink
              : darkSurface
              ? Colors.darkBorder
              : Colors.border,
          },
        ]}
      >
        {leftPrefix && (
          <Text
            style={[
              Typography.body,
              {
                color: darkSurface ? Colors.darkMuted : Colors.muted,
                marginRight: Spacing.xs,
              },
            ]}
          >
            {leftPrefix}
          </Text>
        )}

        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={darkSurface ? Colors.darkMuted : Colors.mutedLight}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          autoCapitalize="none"
          autoCorrect={false}
          style={[
            styles.input,
            Typography.body,
            {
              color: darkSurface ? Colors.white : Colors.ink,
            },
          ]}
          {...props}
        />

        {rightAction && <View style={styles.rightAction}>{rightAction}</View>}
      </View>

      {error ? (
        <Text style={[Typography.caption, styles.errorText]}>{error}</Text>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    width: '100%',
  },
  inputContainer: {
    height: 52,
    borderRadius: Radii.input,
    borderWidth: 1.5,
    paddingHorizontal: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
  },
  input: {
    flex: 1,
    height: '100%',
    padding: 0,
  },
  rightAction: {
    marginLeft: Spacing.xs,
  },
  errorText: {
    color: Colors.error,
    marginTop: Spacing.xs,
    marginLeft: Spacing.xs,
  },
});
