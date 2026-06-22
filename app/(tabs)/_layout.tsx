import React, { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, fonts, shadows } from '@/lib/theme';
import { TabContext } from '@/lib/tab-context';

// Import each screen component directly so the tab bar can switch between them.
import HomeScreen from './index';
import TrackerScreen from './tracker';
import HistoryScreen from './history';
import JournalScreen from './journal';
import PatternsScreen from './patterns';
import SettingsScreen from './settings';

type Tab = {
  name: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconOutline: keyof typeof Ionicons.glyphMap;
  component: React.ComponentType;
};

const TABS: Tab[] = [
  { name: 'index',    label: 'Home',     icon: 'home',        iconOutline: 'home-outline',        component: HomeScreen },
  { name: 'tracker',  label: 'Tracker',  icon: 'stats-chart', iconOutline: 'stats-chart-outline', component: TrackerScreen },
  { name: 'history',  label: 'History',  icon: 'time',        iconOutline: 'time-outline',        component: HistoryScreen },
  { name: 'journal',  label: 'Journal',  icon: 'mic',         iconOutline: 'mic-outline',         component: JournalScreen },
  { name: 'patterns', label: 'Patterns', icon: 'bar-chart',   iconOutline: 'bar-chart-outline',   component: PatternsScreen },
  { name: 'settings', label: 'Settings', icon: 'settings',    iconOutline: 'settings-outline',    component: SettingsScreen },
];

// Renders the main tab navigator. Tapping a tab switches screens instantly —
// there is no swipe gesture. Every screen stays mounted so scroll position and
// state are preserved; only the active one is visible.
export default function TabLayout(): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const [activeIndex, setActiveIndex] = useState(0);

  const goToTab = useCallback((index: number) => {
    setActiveIndex(Math.max(0, Math.min(index, TABS.length - 1)));
  }, []);

  // Bottom padding for each page so content clears the floating tab bar.
  const pagePaddingBottom = insets.bottom + 80;

  return (
    <TabContext.Provider value={{ goToTab, activeTabIndex: activeIndex }}>
      <View style={styles.root}>
        <View style={styles.pages}>
          {TABS.map((tab, index) => {
            const Screen = tab.component;
            const isActive = index === activeIndex;
            return (
              <View
                key={tab.name}
                style={[
                  StyleSheet.absoluteFill,
                  { paddingBottom: pagePaddingBottom, display: isActive ? 'flex' : 'none' },
                ]}
                accessibilityElementsHidden={!isActive}
                importantForAccessibility={isActive ? 'auto' : 'no-hide-descendants'}
              >
                <Screen />
              </View>
            );
          })}
        </View>

        {/* Floating tab bar — tap to switch */}
        <View style={[styles.floatingBar, { bottom: insets.bottom + 16 }]}>
          {TABS.map((tab, index) => {
            const isFocused = activeIndex === index;
            const iconName = isFocused ? tab.icon : tab.iconOutline;
            const iconColor = isFocused ? colors.bg : colors.textMuted;

            return (
              <Pressable
                key={tab.name}
                onPress={() => goToTab(index)}
                accessibilityRole="button"
                accessibilityState={isFocused ? { selected: true } : {}}
                style={[styles.tabItem, isFocused ? styles.tabItemActive : null]}
              >
                <Ionicons name={iconName} size={20} color={iconColor} />
                <Text
                  numberOfLines={1}
                  style={isFocused ? styles.activeLabel : styles.inactiveLabel}
                >
                  {tab.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </TabContext.Provider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  pages: {
    flex: 1,
  },
  floatingBar: {
    position: 'absolute',
    alignSelf: 'center',
    width: '92%',
    backgroundColor: colors.surface,
    borderRadius: 40,
    paddingVertical: 10,
    paddingHorizontal: 8,
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    ...shadows.card,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
  },
  tabItemActive: {
    backgroundColor: colors.accent,
    borderRadius: 16,
    marginHorizontal: 2,
  },
  activeLabel: {
    color: colors.bg,
    fontSize: 9,
    fontFamily: fonts.ui,
    marginTop: 3,
    letterSpacing: 0.5,
  },
  inactiveLabel: {
    color: colors.textMuted,
    fontSize: 9,
    fontFamily: fonts.ui,
    marginTop: 3,
    letterSpacing: 0.5,
  },
});
