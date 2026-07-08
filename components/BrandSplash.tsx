import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from 'react-native-svg';

import { colors, fonts } from '@/lib/theme';

// A clean champagne pawn built from simple geometry.
function ChampagnePawn(): React.JSX.Element {
  return (
    <Svg width={168} height={224} viewBox="0 0 200 260">
      <Defs>
        <LinearGradient id="pawnBody" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={colors.accentLight} />
          <Stop offset="0.55" stopColor={colors.accent} />
          <Stop offset="1" stopColor={colors.accentDim} />
        </LinearGradient>
      </Defs>
      {/* head */}
      <Circle cx="100" cy="58" r="32" fill="url(#pawnBody)" />
      {/* glossy highlight */}
      <Circle cx="87" cy="45" r="9" fill={colors.accentLight} opacity={0.7} />
      {/* collar */}
      <Path d="M58 100 Q100 118 142 100 L134 124 Q100 138 66 124 Z" fill="url(#pawnBody)" />
      {/* body */}
      <Path
        d="M72 124 C64 162 59 186 54 206 L146 206 C141 186 136 162 128 124 Z"
        fill="url(#pawnBody)"
      />
      {/* base */}
      <Path d="M42 206 Q36 221 44 234 L156 234 Q164 221 158 206 Z" fill="url(#pawnBody)" />
    </Svg>
  );
}

// The branded loading screen: a floating champagne pawn with a pulsing glow,
// a breathing ground shadow, and staggered loading dots.
export default function BrandSplash(): React.JSX.Element {
  const enter = useSharedValue(0); // entrance progress
  const float = useSharedValue(0); // endless hover loop
  const glow = useSharedValue(0); // glow pulse loop
  const titleIn = useSharedValue(0);
  const dot1 = useSharedValue(0.25);
  const dot2 = useSharedValue(0.25);
  const dot3 = useSharedValue(0.25);

  useEffect(() => {
    enter.value = withSpring(1, { damping: 13, stiffness: 95, mass: 0.7 });
    float.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1500, easing: Easing.inOut(Easing.quad) }),
        withTiming(0, { duration: 1500, easing: Easing.inOut(Easing.quad) })
      ),
      -1,
      false
    );
    glow.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1300, easing: Easing.inOut(Easing.quad) }),
        withTiming(0, { duration: 1300, easing: Easing.inOut(Easing.quad) })
      ),
      -1,
      false
    );
    titleIn.value = withDelay(
      300,
      withTiming(1, { duration: 650, easing: Easing.out(Easing.cubic) })
    );
    const pulse = (delay: number) =>
      withDelay(
        delay,
        withRepeat(
          withSequence(
            withTiming(1, { duration: 320, easing: Easing.out(Easing.quad) }),
            withTiming(0.25, { duration: 640, easing: Easing.in(Easing.quad) })
          ),
          -1,
          false
        )
      );
    dot1.value = pulse(0);
    dot2.value = pulse(240);
    dot3.value = pulse(480);
  }, [enter, float, glow, titleIn, dot1, dot2, dot3]);

  const pieceStyle = useAnimatedStyle(() => ({
    opacity: enter.value,
    transform: [
      {
        translateY:
          interpolate(enter.value, [0, 1], [46, 0]) +
          interpolate(float.value, [0, 1], [4, -8]),
      },
      { scale: interpolate(enter.value, [0, 1], [0.5, 1]) },
      { rotate: `${interpolate(float.value, [0, 1], [-1.8, 1.8])}deg` },
    ],
  }));

  const glowStyle = useAnimatedStyle(() => ({
    opacity: enter.value * interpolate(glow.value, [0, 1], [0.1, 0.26]),
    transform: [{ scale: interpolate(glow.value, [0, 1], [0.85, 1.12]) }],
  }));

  const shadowStyle = useAnimatedStyle(() => ({
    opacity: enter.value * interpolate(float.value, [0, 1], [0.4, 0.16]),
    transform: [{ scaleX: interpolate(float.value, [0, 1], [1, 0.72]) }],
  }));

  const titleStyle = useAnimatedStyle(() => ({
    opacity: titleIn.value,
    transform: [{ translateY: interpolate(titleIn.value, [0, 1], [14, 0]) }],
  }));

  const d1 = useAnimatedStyle(() => ({ opacity: dot1.value }));
  const d2 = useAnimatedStyle(() => ({ opacity: dot2.value }));
  const d3 = useAnimatedStyle(() => ({ opacity: dot3.value }));

  return (
    <View style={styles.root}>
      <View style={styles.stage}>
        <Animated.View style={[styles.glow, glowStyle]} />
        <Animated.View style={pieceStyle}>
          <ChampagnePawn />
        </Animated.View>
        <Animated.View style={[styles.shadow, shadowStyle]} />
      </View>

      <Animated.View style={[styles.titleWrap, titleStyle]}>
        <Text style={styles.title}>ChessTrack</Text>
        <Text style={styles.tagline}>TRACK · ANALYZE · IMPROVE</Text>
      </Animated.View>

      <View style={styles.dotsRow}>
        <Animated.View style={[styles.dot, d1]} />
        <Animated.View style={[styles.dot, d2]} />
        <Animated.View style={[styles.dot, d3]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stage: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  glow: {
    position: 'absolute',
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: colors.accent,
  },
  shadow: {
    width: 120,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#000000',
    marginTop: 10,
  },
  titleWrap: {
    alignItems: 'center',
    marginTop: 28,
  },
  title: {
    fontFamily: fonts.headline,
    fontSize: 34,
    color: colors.textPrimary,
    letterSpacing: 2,
  },
  tagline: {
    fontFamily: fonts.ui,
    fontSize: 10,
    color: colors.textMuted,
    letterSpacing: 4,
    marginTop: 8,
  },
  dotsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 26,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.accent,
  },
});
