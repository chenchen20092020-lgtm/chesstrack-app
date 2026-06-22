import React, { useEffect } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { FontAwesome5, Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { colors, fonts, radius, shadows, spacing } from '@/lib/theme';
import { getLesson, LESSONS, movesFor, ORIGIN } from '@/lib/lessons';

const MOVE_FILL = 'rgba(63, 163, 122, 0.28)';
const CAPTURE_FILL = 'rgba(224, 101, 91, 0.28)';
const ORIGIN_FILL = 'rgba(201, 183, 133, 0.16)';

// Renders a single piece "world": a spinning hero piece + how it moves.
export default function PieceLesson(): React.JSX.Element {
  const { piece } = useLocalSearchParams<{ piece: string }>();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const lesson = getLesson(piece);

  // Entrance animation: the piece fades in, scales up, and spins in 3D.
  const spin = useSharedValue(0);
  const scale = useSharedValue(0.4);
  const fade = useSharedValue(0);

  useEffect(() => {
    spin.value = 0;
    scale.value = 0.4;
    fade.value = 0;
    fade.value = withTiming(1, { duration: 350 });
    scale.value = withSpring(1, { damping: 11, stiffness: 110, mass: 0.6 });
    spin.value = withTiming(720, { duration: 1150, easing: Easing.out(Easing.cubic) });
  }, [piece, fade, scale, spin]);

  const heroStyle = useAnimatedStyle(() => ({
    opacity: fade.value,
    transform: [
      { perspective: 800 },
      { rotateY: `${spin.value}deg` },
      { scale: scale.value },
    ],
  }));

  if (!lesson) {
    return (
      <View style={[styles.container, styles.center]}>
        <StatusBar style="light" backgroundColor={colors.bg} />
        <Text style={styles.missing}>That piece could not be found.</Text>
        <Pressable onPress={() => router.replace('/learn' as Href)} style={styles.missingButton}>
          <Text style={styles.missingButtonText}>Back to Learn</Text>
        </Pressable>
      </View>
    );
  }

  const boardSize = Math.min(width - spacing.lg * 2, 360);
  const cell = boardSize / 8;
  const moves = movesFor(lesson.key);
  const moveMap: Record<string, 'move' | 'capture'> = {};
  moves.forEach((m) => {
    moveMap[`${m.r}-${m.c}`] = m.type;
  });

  const index = LESSONS.findIndex((l) => l.key === lesson.key);
  const prev = index > 0 ? LESSONS[index - 1] : null;
  const next = index < LESSONS.length - 1 ? LESSONS[index + 1] : null;
  const showCaptureLegend = lesson.key === 'pawn';

  return (
    <View style={styles.container}>
      <StatusBar style="light" backgroundColor={colors.bg} />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + spacing.xl },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          style={({ pressed }) => [styles.backRow, pressed && styles.pressed]}
        >
          <Ionicons name="chevron-back" size={20} color={colors.textSecondary} />
          <Text style={styles.backText}>All pieces</Text>
        </Pressable>

        {/* ── Spinning hero piece ─────────────────────────────────────────── */}
        <View style={styles.heroStage}>
          <Animated.View style={heroStyle}>
            <FontAwesome5 name={lesson.icon} size={120} color={colors.accent} />
          </Animated.View>
        </View>

        <Text style={styles.name}>{lesson.name}</Text>
        <View style={styles.valueBadge}>
          <Text style={styles.valueBadgeText}>{lesson.value}</Text>
        </View>
        <Text style={styles.tagline}>{lesson.tagline}</Text>

        {/* ── How it moves ────────────────────────────────────────────────── */}
        <Text style={styles.sectionTitle}>How it moves</Text>
        <Text style={styles.body}>{lesson.howItMoves}</Text>

        <View style={[styles.board, { width: boardSize, height: boardSize }]}>
          {Array.from({ length: 8 }).map((_, r) => (
            <View key={r} style={styles.boardRow}>
              {Array.from({ length: 8 }).map((_, c) => {
                const isOrigin = r === ORIGIN.r && c === ORIGIN.c;
                const mt = moveMap[`${r}-${c}`];
                const dark = (r + c) % 2 === 1;
                const baseBg = isOrigin
                  ? ORIGIN_FILL
                  : dark
                    ? colors.surface
                    : colors.surfaceHighlight;
                return (
                  <View
                    key={c}
                    style={{
                      width: cell,
                      height: cell,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: baseBg,
                    }}
                  >
                    {mt && !isOrigin ? (
                      <View
                        style={[
                          StyleSheet.absoluteFill,
                          { backgroundColor: mt === 'capture' ? CAPTURE_FILL : MOVE_FILL },
                        ]}
                      />
                    ) : null}
                    {isOrigin ? (
                      <FontAwesome5 name={lesson.icon} size={cell * 0.6} color={colors.gold} />
                    ) : mt === 'move' ? (
                      <View
                        style={{
                          width: cell * 0.26,
                          height: cell * 0.26,
                          borderRadius: cell * 0.13,
                          backgroundColor: colors.accent,
                        }}
                      />
                    ) : mt === 'capture' ? (
                      <View
                        style={{
                          width: cell * 0.5,
                          height: cell * 0.5,
                          borderRadius: cell * 0.25,
                          borderWidth: 2,
                          borderColor: colors.danger,
                        }}
                      />
                    ) : null}
                  </View>
                );
              })}
            </View>
          ))}
        </View>

        <View style={styles.legend}>
          <View style={styles.legendItem}>
            <View style={styles.legendDot} />
            <Text style={styles.legendText}>Where it can move</Text>
          </View>
          {showCaptureLegend ? (
            <View style={styles.legendItem}>
              <View style={styles.legendRing} />
              <Text style={styles.legendText}>How it captures</Text>
            </View>
          ) : null}
        </View>

        {/* ── Develop / Manipulate ────────────────────────────────────────── */}
        <View style={styles.tipCard}>
          <Text style={styles.tipLabel}>DEVELOP IT</Text>
          <Text style={styles.body}>{lesson.develop}</Text>
        </View>
        <View style={styles.tipCard}>
          <Text style={styles.tipLabel}>USE IT</Text>
          <Text style={styles.body}>{lesson.manipulate}</Text>
        </View>

        {/* ── Prev / Next ─────────────────────────────────────────────────── */}
        <View style={styles.navRow}>
          {prev ? (
            <Pressable
              onPress={() => router.replace(`/learn/${prev.key}` as Href)}
              accessibilityRole="button"
              style={({ pressed }) => [styles.navButton, pressed && styles.pressed]}
            >
              <Ionicons name="chevron-back" size={16} color={colors.textSecondary} />
              <Text style={styles.navText}>{prev.name}</Text>
            </Pressable>
          ) : (
            <View style={styles.navButton} />
          )}
          {next ? (
            <Pressable
              onPress={() => router.replace(`/learn/${next.key}` as Href)}
              accessibilityRole="button"
              style={({ pressed }) => [styles.navButton, styles.navButtonNext, pressed && styles.pressed]}
            >
              <Text style={styles.navTextNext}>{next.name}</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.accent} />
            </Pressable>
          ) : (
            <View style={styles.navButton} />
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  content: {
    paddingHorizontal: spacing.lg,
  },
  missing: {
    color: colors.textSecondary,
    fontFamily: fonts.body,
    fontSize: 15,
    marginBottom: spacing.md,
  },
  missingButton: {
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  missingButtonText: {
    color: colors.bg,
    fontFamily: fonts.subheadline,
    fontSize: 14,
  },
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    marginBottom: spacing.md,
  },
  backText: {
    color: colors.textSecondary,
    fontFamily: fonts.ui,
    fontSize: 14,
    marginLeft: 2,
  },
  pressed: {
    opacity: 0.6,
  },
  heroStage: {
    height: 180,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  name: {
    color: colors.textPrimary,
    fontFamily: fonts.headline,
    fontSize: 34,
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  valueBadge: {
    alignSelf: 'center',
    backgroundColor: colors.surfaceHighlight,
    borderColor: colors.goldDim,
    borderWidth: 1,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    marginTop: spacing.sm,
  },
  valueBadgeText: {
    color: colors.gold,
    fontFamily: fonts.ui,
    fontSize: 12,
    letterSpacing: 1,
  },
  tagline: {
    color: colors.textSecondary,
    fontFamily: fonts.body,
    fontSize: 14,
    textAlign: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.xl,
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontFamily: fonts.subheadline,
    fontSize: 18,
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },
  body: {
    color: colors.textSecondary,
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 22,
  },
  board: {
    alignSelf: 'center',
    marginTop: spacing.lg,
    borderRadius: radius.sm,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.card,
  },
  boardRow: {
    flexDirection: 'row',
  },
  legend: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.lg,
    marginTop: spacing.md,
    marginBottom: spacing.xl,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  legendDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.accent,
  },
  legendRing: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: colors.danger,
  },
  legendText: {
    color: colors.textSecondary,
    fontFamily: fonts.body,
    fontSize: 12,
  },
  tipCard: {
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderLeftWidth: 3,
    borderLeftColor: colors.accent,
    ...shadows.card,
  },
  tipLabel: {
    color: colors.textMuted,
    fontFamily: fonts.ui,
    fontSize: 10,
    letterSpacing: 2,
    marginBottom: spacing.sm,
  },
  navRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.md,
  },
  navButton: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
    paddingHorizontal: spacing.sm,
    gap: 2,
  },
  navButtonNext: {
    justifyContent: 'flex-end',
  },
  navText: {
    color: colors.textSecondary,
    fontFamily: fonts.ui,
    fontSize: 14,
  },
  navTextNext: {
    color: colors.accent,
    fontFamily: fonts.subheadline,
    fontSize: 14,
    letterSpacing: 0.5,
  },
});
