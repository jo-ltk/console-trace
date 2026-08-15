import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { Colors } from '../../constants/colors';

interface StatusIndicatorProps {
  status: 'ready' | 'active' | 'warning' | 'error' | 'idle';
  size?: number;
  style?: ViewStyle;
}

export const StatusIndicator: React.FC<StatusIndicatorProps> = ({
  status,
  size = 8,
  style,
}) => {
  const getColors = () => {
    switch (status) {
      case 'ready':
      case 'active':
        return { dot: Colors.scannerGreen, ring: Colors.scannerDimGreen };
      case 'warning':
        return { dot: Colors.warning, ring: Colors.warningSubtle };
      case 'error':
        return { dot: Colors.error, ring: Colors.errorSubtle };
      case 'idle':
      default:
        return { dot: Colors.muted, ring: 'rgba(115, 115, 115, 0.15)' };
    }
  };

  const { dot, ring } = getColors();

  return (
    <View
      style={[
        styles.ring,
        {
          width: size * 2.2,
          height: size * 2.2,
          borderRadius: 999,
          backgroundColor: ring,
        },
        style,
      ]}
    >
      <View
        style={[
          styles.dot,
          {
            width: size,
            height: size,
            borderRadius: 999,
            backgroundColor: dot,
          },
        ]}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  ring: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  dot: {},
});
