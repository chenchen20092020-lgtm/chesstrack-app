import React, { useCallback, useRef, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS,
} from 'react-native-reanimated';

import { colors, fonts, shadows } from '@/lib/theme';
import { TabContext } from '@/lib/tab-context';

// Import each screen component directly so they live side-by-side in the pager.
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

const SPRING_CONFIG = {
  damping: 20,
  stiffness: 120,
  mass: 0.5,
};

const SWIPE_VELOCITY_THRESHOLD = 500;
const SWIPE_DISTANCE_RATIO = 0.3;

// Memoized page wrapper — only re-renders when its own content changes,
// not when the parent's activeIndex updates.
const TabPage = React.memo(function TabPage({
  tab,
  width,
  height,
  paddingBottom,
  mounted,
}: {
  tab: Tab;
  width: number;
  height: number;
  paddingBottom: number;
  mounted: boolean;
}) {
  return (
    <View style={{ width, height, paddingBottom }}>
      {mounted ? <tab.component /> : null}
    </View>
  );
});

// Renders the main tab pager — all screens live side-by-side in a horizontal
// pager so swiping shows both pages simultaneously (Clash Royale style).
export default function TabLayout(): React.JSX.Element {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [activeIndex, setActiveIndex] = useState(0);
  // Keep every screen mounted side-by-side so swiping never reveals a blank
  // page mid-gesture (a major source of the old "cranky" feel).
  const mountedSet = useRef(new Set(TABS.map((_, i) => i))).current;

  const translateX = useSharedValue(0);
  const contextX = useSharedValue(0);
  const activeIndexSV = useSharedValue(0);

  const updateActiveIndex = useCallback((index: number) => {
    // Mark this screen and its neighbors as mounted so they stay alive.
    mountedSet.add(index);
    if (index > 0) mountedSet.add(index - 1);
    if (index < TABS.length - 1) mountedSet.add(index + 1);
    setActiveIndex(index);
  }, [mountedSet]);

  const snapTo = useCallback(
    (index: number, velocity = 0) => {
      'worklet';
      const clamped = Math.max(0, Math.min(index, TABS.length - 1));
      activeIndexSV.value = clamped;
      // Carry the fling velocity into the spring so the page continues the
      // motion of the finger instead of restarting from a dead stop.
      translateX.value = withSpring(-clamped * width, { ...SPRING_CONFIG, velocity });
      runOnJS(updateActiveIndex)(clamped);
    },
    [width, translateX, activeIndexSV, updateActiveIndex]
  );

  // Programmatically scroll to a tab and update the active index.
  const goToTab = useCallback(
    (index: number) => {
      const clamped = Math.max(0, Math.min(index, TABS.length - 1));
      mountedSet.add(clamped);
      if (clamped > 0) mountedSet.add(clamped - 1);
      if (clamped < TABS.length - 1) mountedSet.add(clamped + 1);
      activeIndexSV.value = clamped;
      translateX.value = withSpring(-clamped * width, SPRING_CONFIG);
      setActiveIndex(clamped);
    },
    [width, translateX, activeIndexSV, mountedSet]
  );

  const panGesture = Gesture.Pan()
    .activeOffsetX([-10, 10])
    .failOffsetY([-12, 12])
    .onStart(() => {
      contextX.value = translateX.value;
    })
    .onUpdate((e) => {
      const newX = contextX.value + e.translationX;
      const minX = -(TABS.length - 1) * width;
      // Add rubber-band resistance at edges
      if (newX > 0) {
        translateX.value = newX * 0.3;
      } else if (newX < minX) {
        translateX.value = minX + (newX - minX) * 0.3;
      } else {
        translateX.value = newX;
      }
    })
    .onEnd((e) => {
      const current = activeIndexSV.value;
      const swipedFarEnough =
        Math.abs(e.translationX) > width * SWIPE_DISTANCE_RATIO;
      const swipedFast =
        Math.abs(e.velocityX) > SWIPE_VELOCITY_THRESHOLD;

      if ((swipedFarEnough || swipedFast) && e.translationX < 0) {
        snapTo(current + 1, e.velocityX);
      } else if ((swipedFarEnough || swipedFast) && e.translationX > 0) {
        snapTo(current - 1, e.velocityX);
      } else {
        snapTo(current, e.velocityX);
      }
    });

  const pagerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  // Bottom padding for each page so content doesn't hide behind the tab bar.
  const pagePaddingBottom = insets.bottom + 80;

  return (
    <TabContext.Provider value={{ goToTab, activeTabIndex: activeIndex }}>
      <View style={styles.root}>
        <GestureDetector gesture={panGesture}>
          <Animated.View
            style={[
              styles.pagerContent,
              { width: width * TABS.length },
              pagerStyle,
            ]}
          >
            {TABS.map((tab, index) => (
              <TabPage
                key={tab.name}
                tab={tab}
                width={width}
                height={height}
                paddingBottom={pagePaddingBottom}
                mounted={mountedSet.has(index)}
              />
            ))}
          </Animated.View>
        </GestureDetector>

        {/* Floating tab bar */}
        <View style={[styles.floatingBar, { bottom: insets.bottom + 16 }]}>
          {TABS.map((tab, index) => {
            const isFocused = activeIndex === index;
            const iconName = isFocused ? tab.icon : tab.iconOutline;
            const iconSize = 20;
            const iconColor = isFocused ? colors.bg : colors.textMuted;

            return (
              <Pressable
                key={tab.name}
                onPress={() => goToTab(index)}
                accessibilityRole="button"
                accessibilityState={isFocused ? { selected: true } : {}}
                style={[styles.tabItem, isFocused ? styles.tabItemActive : null]}
              >
                <Ionicons name={iconName} size={iconSize} color={iconColor} />
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
  pagerContent: {
    flex: 1,
    flexDirection: 'row',
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
