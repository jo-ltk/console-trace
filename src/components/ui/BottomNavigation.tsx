import React from 'react';
import { View, Text, StyleSheet, Pressable, Platform } from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import { Colors } from '../../constants/colors';
import { Radii } from '../../constants/radii';
import { Spacing } from '../../constants/spacing';
import { Typography } from '../../constants/typography';
import { triggerHaptic } from '../../utils/haptics';

interface NavItem {
  key: string;
  label: string;
  route: string;
}

const NAV_ITEMS: NavItem[] = [
  { key: 'scan', label: 'SCAN', route: '/' },
  { key: 'history', label: 'HISTORY', route: '/history' },
  { key: 'settings', label: 'SETTINGS', route: '/settings' },
];

export const BottomNavigation: React.FC = () => {
  const router = useRouter();
  const pathname = usePathname();

  const navItems = Platform.OS === 'web'
    ? NAV_ITEMS.filter((item) => item.key !== 'history')
    : NAV_ITEMS;

  const getActiveKey = () => {
    if (pathname === '/history' || pathname.startsWith('/history/')) return 'history';
    if (pathname === '/settings' || pathname.startsWith('/settings/')) return 'settings';
    return 'scan';
  };

  const activeKey = getActiveKey();

  const handleTabPress = (item: NavItem) => {
    if (item.key === activeKey) return;
    triggerHaptic('light');
    router.replace(item.route as any);
  };

  return (
    <View style={styles.floatingWrapper} pointerEvents="box-none">
      <View style={styles.container}>
        {navItems.map((item) => {
          const isActive = item.key === activeKey;
          return (
            <Pressable
              key={item.key}
              onPress={() => handleTabPress(item)}
              accessible={true}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
              accessibilityLabel={`${item.label} tab`}
              style={({ pressed }) => [
                styles.tabItem,
                isActive && styles.activeTabItem,
                {
                  transform: [{ scale: pressed ? 0.95 : 1 }],
                },
              ]}
            >
              <Text
                style={[
                  Typography.navLabel,
                  {
                    color: isActive ? Colors.white : Colors.muted,
                  },
                ]}
              >
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  floatingWrapper: {
    position: 'absolute',
    bottom: Spacing.xl,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 100,
  },
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    borderRadius: Radii.nav,
    padding: Spacing.xxs,
    borderWidth: 1,
    borderColor: Colors.border,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 8,
  },
  tabItem: {
    paddingVertical: 10,
    paddingHorizontal: Spacing.lg,
    borderRadius: Radii.button,
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 84,
  },
  activeTabItem: {
    backgroundColor: Colors.ink,
  },
});
