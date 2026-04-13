import React, { useEffect } from 'react';
import { StyleSheet, View, Text } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  Easing,
} from 'react-native-reanimated';
import Svg, { Path, Circle, Rect, G, Defs, ClipPath } from 'react-native-svg';
import { fonts } from '@/lib/theme';

// Side-view hand holding a pawn — black and white with creative inversion.
function HandAndPawn(): React.JSX.Element {
  return (
    <Svg width={220} height={280} viewBox="0 0 220 280">
      <Defs>
        {/* Clip for the pawn's inverted fill */}
        <ClipPath id="pawnClip">
          {/* Pawn head */}
          <Circle cx="110" cy="52" r="22" />
          {/* Pawn neck */}
          <Rect x="101" y="72" width="18" height="16" rx="4" />
          {/* Pawn collar */}
          <Path d="M88 88 Q110 96 132 88 L136 100 Q110 110 84 100 Z" />
          {/* Pawn body */}
          <Path d="M84 100 Q78 130 76 155 L144 155 Q142 130 136 100 Z" />
          {/* Pawn base */}
          <Path d="M70 155 Q68 165 70 172 L150 172 Q152 165 150 155 Z" />
        </ClipPath>
      </Defs>

      {/* ── Pawn: white outline, black fill with white interior pattern ── */}
      <G>
        {/* Pawn solid black silhouette */}
        <Circle cx="110" cy="52" r="22" fill="#111" />
        <Rect x="101" y="72" width="18" height="16" rx="4" fill="#111" />
        <Path d="M88 88 Q110 96 132 88 L136 100 Q110 110 84 100 Z" fill="#111" />
        <Path d="M84 100 Q78 130 76 155 L144 155 Q142 130 136 100 Z" fill="#111" />
        <Path d="M70 155 Q68 165 70 172 L150 172 Q152 165 150 155 Z" fill="#111" />

        {/* White highlight stripes inside the pawn (inverted interior) */}
        <G clipPath="url(#pawnClip)">
          {/* Diagonal light streaks */}
          <Rect x="60" y="30" width="8" height="160" fill="#F0F0F0" transform="rotate(12 110 100)" />
          <Rect x="90" y="30" width="3" height="160" fill="#E8E8E8" transform="rotate(12 110 100)" />
          <Rect x="120" y="30" width="6" height="160" fill="#F0F0F0" transform="rotate(12 110 100)" />
          <Rect x="145" y="30" width="2" height="160" fill="#E8E8E8" transform="rotate(12 110 100)" />
          {/* Circular highlight on head */}
          <Circle cx="104" cy="46" r="8" fill="#F5F5F5" />
          <Circle cx="104" cy="46" r="4" fill="#111" />
        </G>

        {/* Pawn white outline */}
        <Circle cx="110" cy="52" r="22" fill="none" stroke="#F0F0F0" strokeWidth="1.5" />
        <Path d="M88 88 Q110 96 132 88 L136 100 Q110 110 84 100 Z" fill="none" stroke="#F0F0F0" strokeWidth="1" />
        <Path d="M70 155 Q68 165 70 172 L150 172 Q152 165 150 155 Z" fill="none" stroke="#F0F0F0" strokeWidth="1.5" />
      </G>

      {/* ── Hand: white silhouette with black interior details ── */}
      <G>
        {/* Wrist / forearm coming from bottom-right */}
        <Path
          d="M200 280 Q190 250 175 230 Q165 218 155 210 L150 172 L130 172 L125 200 Q115 215 105 225 Q95 235 90 250 Q85 265 88 280 Z"
          fill="#F0F0F0"
        />

        {/* Fingers wrapping around the pawn base */}
        {/* Thumb (front, visible) */}
        <Path
          d="M70 172 Q55 168 50 158 Q47 150 52 143 Q58 136 68 140 L76 155"
          fill="#F0F0F0"
          stroke="#111"
          strokeWidth="1"
        />
        {/* Thumb inner crease */}
        <Path
          d="M58 150 Q62 148 66 150"
          fill="none"
          stroke="#111"
          strokeWidth="0.8"
        />

        {/* Index finger (wrapping over the base from front) */}
        <Path
          d="M70 172 Q60 178 56 170 Q52 162 58 155 Q64 150 70 155"
          fill="#F0F0F0"
          stroke="#111"
          strokeWidth="1"
        />

        {/* Middle + ring fingers (behind pawn, peeking out) */}
        <Path
          d="M150 172 Q162 176 165 168 Q168 160 162 154 Q156 150 150 155"
          fill="#D8D8D8"
          stroke="#111"
          strokeWidth="1"
        />
        <Path
          d="M150 162 Q158 165 160 160 Q162 155 158 151 Q154 148 150 152"
          fill="#D0D0D0"
          stroke="#111"
          strokeWidth="0.8"
        />

        {/* Hand interior details — knuckle lines, tendons */}
        <Path
          d="M130 180 Q135 195 132 210"
          fill="none"
          stroke="#333"
          strokeWidth="0.8"
        />
        <Path
          d="M140 178 Q148 195 145 215"
          fill="none"
          stroke="#333"
          strokeWidth="0.8"
        />
        <Path
          d="M120 185 Q122 200 118 220"
          fill="none"
          stroke="#333"
          strokeWidth="0.6"
        />

        {/* Wrist crease */}
        <Path
          d="M100 240 Q130 235 160 242"
          fill="none"
          stroke="#444"
          strokeWidth="0.8"
        />
        <Path
          d="M105 246 Q128 242 155 248"
          fill="none"
          stroke="#444"
          strokeWidth="0.6"
        />
      </G>

      {/* ── Shadow / ground reflection ── */}
      <Path
        d="M50 172 Q110 182 170 172"
        fill="none"
        stroke="#333"
        strokeWidth="0.5"
        opacity={0.5}
      />
    </Svg>
  );
}

export default function BrandSplash(): React.JSX.Element {
  const titleOpacity = useSharedValue(0);
  const titleTranslateY = useSharedValue(-12);
  const artOpacity = useSharedValue(0);
  const artScale = useSharedValue(0.92);

  useEffect(() => {
    titleOpacity.value = withDelay(
      200,
      withTiming(1, { duration: 600, easing: Easing.out(Easing.quad) })
    );
    titleTranslateY.value = withDelay(
      200,
      withTiming(0, { duration: 600, easing: Easing.out(Easing.quad) })
    );
    artOpacity.value = withDelay(
      450,
      withTiming(1, { duration: 700, easing: Easing.out(Easing.quad) })
    );
    artScale.value = withDelay(
      450,
      withTiming(1, { duration: 700, easing: Easing.out(Easing.quad) })
    );
  }, [titleOpacity, titleTranslateY, artOpacity, artScale]);

  const titleStyle = useAnimatedStyle(() => ({
    opacity: titleOpacity.value,
    transform: [{ translateY: titleTranslateY.value }],
  }));

  const artStyle = useAnimatedStyle(() => ({
    opacity: artOpacity.value,
    transform: [{ scale: artScale.value }],
  }));

  return (
    <View style={styles.root}>
      <Animated.View style={[styles.titleWrap, titleStyle]}>
        <Text style={styles.title}>ChessTrack</Text>
      </Animated.View>

      <Animated.View style={[styles.artWrap, artStyle]}>
        <HandAndPawn />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0A0A0A',
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 100,
  },
  titleWrap: {
    marginBottom: 40,
  },
  title: {
    fontFamily: fonts.headline,
    fontSize: 32,
    color: '#F0F0F0',
    letterSpacing: 2,
    textAlign: 'center',
  },
  artWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
