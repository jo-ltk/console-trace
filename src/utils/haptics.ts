import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

export function triggerHaptic(type: 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error' | 'impact' = 'light') {
  if (Platform.OS === 'web') return;
  try {
    switch (type) {
      case 'light':
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        break;
      case 'medium':
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        break;
      case 'heavy':
      case 'impact':
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        break;
      case 'success':
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        break;
      case 'warning':
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        break;
      case 'error':
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        break;
    }
  } catch {
    // Non-critical fallback
  }
}
