import React from 'react';
import { Text, TextStyle } from 'react-native';
import { Colors } from '../../constants/colors';
import { Typography } from '../../constants/typography';

interface PixelLabelProps {
  text: string;
  variant?: 'normal' | 'dim' | 'success' | 'warning' | 'error' | 'white';
  style?: TextStyle;
}

export const PixelLabel: React.FC<PixelLabelProps> = ({
  text,
  variant = 'normal',
  style,
}) => {
  const getColor = () => {
    switch (variant) {
      case 'dim':
        return Colors.muted;
      case 'success':
        return Colors.success;
      case 'warning':
        return Colors.warning;
      case 'error':
        return Colors.error;
      case 'white':
        return Colors.white;
      default:
        return Colors.ink;
    }
  };

  return (
    <Text
      style={[
        Typography.pixelLabel,
        {
          color: getColor(),
        },
        style,
      ]}
    >
      {text}
    </Text>
  );
};
