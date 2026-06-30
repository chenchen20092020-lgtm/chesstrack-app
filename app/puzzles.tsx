import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import Chessboard, { type ChessboardRef } from 'react-native-chessboard';
import { MotiView } from 'moti';

import { colors, fonts, radius, shadows, spacing } from '@/lib/theme';
import {
  addPuzzleSolved,
  getPuzzleStats,
  PuzzleStats,
  XP_PER_LEVEL,
} from '@/lib/storage';

const BOARD_LIGHT = '#C9B79A';
const BOARD_DARK = '#3B332A';

type Puzzle = {
  fen: string;
  solution: string; // UCI, e.g. "g1f3"
  moveNumber: number;
  classification: string;
  color: 'w' | 'b';
};

const POINTS: Record<string, number> = { blunder: 20, mistake: 15, inaccuracy: 10 };

// Parses the puzzle array passed via route params.
function parsePuzzles(raw: string | string[] | undefined): Puzzle[] {
  try {
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (!value) return [];
    const parsed = JSON.parse(value) as Puzzle[];
    return Array.isArray(parsed) ? parsed.filter((p) => p.fen && p.solution) : [];
  } catch {
    return [];
  }
}

// Renders the targeted-puzzle trainer (Chess.com-style: solve, score, next).
export default function PuzzlesScreen(): React.JSX.Element {
  const params = useLocalSearchParams<{ data?: string }>();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const puzzles = useMemo(() => parsePuzzles(params.data), [params.data]);

  const boardRef = useRef<ChessboardRef>(null);
  const [index, setIndex] = useState(0);
  const [solved, setSolved] = useState(false);
  const [checking, setChecking] = useState(false);
  const [wrong, setWrong] = useState(false);
  const [earned, setEarned] = useState(0);
  const [stats, setStats] = useState<PuzzleStats>({ solved: 0, xp: 0, level: 1 });

  const puzzle = puzzles[index];

  useEffect(() => {
    getPuzzleStats().then(setStats);
  }, []);

  // Reset the board to the current puzzle whenever it changes.
  useEffect(() => {
    if (puzzle) boardRef.current?.resetBoard(puzzle.fen);
  }, [puzzle]);

  const sideToMove = puzzle && puzzle.fen.split(' ')[1] === 'b' ? 'Black' : 'White';

  const onMove = useCallback(
    (info: { move: { from: string; to: string; promotion?: string } }) => {
      if (!puzzle || solved || checking) return;
      const { solution } = puzzle;
      const from = solution.slice(0, 2);
      const to = solution.slice(2, 4);
      const promo = solution.slice(4, 5) || undefined;
      const correct =
        info.move.from === from &&
        info.move.to === to &&
        (!promo || info.move.promotion === promo);

      if (correct) {
        setSolved(true);
        setWrong(false);
        const points = POINTS[puzzle.classification] ?? 15;
        setEarned(points);
        addPuzzleSolved(points).then(setStats);
      } else {
        setWrong(true);
        setChecking(true);
        setTimeout(() => {
          boardRef.current?.resetBoard(puzzle.fen);
          setChecking(false);
        }, 500);
      }
    },
    [puzzle, solved, checking]
  );

  const goNext = useCallback(() => {
    setSolved(false);
    setWrong(false);
    setEarned(0);
    setIndex((i) => Math.min(i + 1, puzzles.length - 1));
  }, [puzzles.length]);

  const atEnd = index >= puzzles.length - 1;
  const boardSize = Math.min(width - spacing.lg * 2 - 16, 360);
  const xpIntoLevel = stats.xp % XP_PER_LEVEL;

  if (puzzles.length === 0 || !puzzle) {
    return (
      <View style={[styles.container, styles.center, { paddingTop: insets.top }]}>
        <StatusBar style="light" backgroundColor={colors.bg} />
        <Text style={styles.emptyText}>No puzzles to train right now.</Text>
        <Pressable onPress={() => router.back()} style={styles.primaryButton}>
          <Text style={styles.primaryButtonText}>Back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.md }]}>
      <StatusBar style="light" backgroundColor={colors.bg} />

      <Pressable
        onPress={() => router.back()}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel="Go back"
        style={styles.backRow}
      >
        <Ionicons name="chevron-back" size={20} color={colors.textSecondary} />
        <Text style={styles.backText}>Back</Text>
      </Pressable>

      {/* ── Path / level ─────────────────────────────────────────────────── */}
      <View style={styles.levelCard}>
        <View style={styles.levelTop}>
          <Text style={styles.levelLabel}>YOUR CHESS PATH</Text>
          <Text style={styles.levelValue}>Level {stats.level}</Text>
        </View>
        <View style={styles.xpTrack}>
          <MotiView
            style={styles.xpFill}
            animate={{ width: `${xpIntoLevel}%` }}
            transition={{ type: 'timing', duration: 500 }}
          />
        </View>
        <Text style={styles.levelMeta}>
          {xpIntoLevel} / {XP_PER_LEVEL} XP · {stats.solved} solved
        </Text>
      </View>

      {/* ── Board ────────────────────────────────────────────────────────── */}
      <View style={styles.boardWrap}>
        <View style={styles.boardFrame}>
          <Chessboard
            ref={boardRef}
            boardSize={boardSize}
            gestureEnabled={!solved}
            fen={puzzle.fen}
            onMove={onMove}
            durations={{ move: 150 }}
            colors={{ white: BOARD_LIGHT, black: BOARD_DARK }}
          />
        </View>
      </View>

      {/* ── Prompt / feedback ────────────────────────────────────────────── */}
      <View style={styles.statusArea}>
        {solved ? (
          <MotiView
            key="solved"
            from={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', damping: 12, stiffness: 160 }}
            style={styles.solvedRow}
          >
            <View style={styles.checkCircle}>
              <Ionicons name="checkmark" size={22} color={colors.bg} />
            </View>
            <Text style={styles.solvedText}>Correct!</Text>
            <Text style={styles.earnedText}>+{earned} XP</Text>
          </MotiView>
        ) : wrong ? (
          <Text style={styles.wrongText}>Not the move you needed — try again.</Text>
        ) : (
          <>
            <Text style={styles.promptTitle}>{sideToMove} to move</Text>
            <Text style={styles.promptSub}>Find the move you missed in this position</Text>
          </>
        )}
      </View>

      {/* ── Next / finish ────────────────────────────────────────────────── */}
      {solved ? (
        atEnd ? (
          <Pressable onPress={() => router.back()} style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>Done — you cleared them all</Text>
          </Pressable>
        ) : (
          <Pressable
            onPress={goNext}
            accessibilityRole="button"
            style={({ pressed }) => [styles.nextButton, pressed && styles.pressed]}
          >
            <Text style={styles.nextButtonText}>Next puzzle</Text>
            <Ionicons name="chevron-forward" size={22} color={colors.bg} />
          </Pressable>
        )
      ) : (
        <Text style={styles.counter}>
          Puzzle {index + 1} of {puzzles.length}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    paddingHorizontal: spacing.lg,
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    color: colors.textSecondary,
    fontFamily: fonts.body,
    fontSize: 15,
    marginBottom: spacing.md,
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
  levelCard: {
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    ...shadows.card,
  },
  levelTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  levelLabel: {
    color: colors.textMuted,
    fontFamily: fonts.ui,
    fontSize: 10,
    letterSpacing: 2,
  },
  levelValue: {
    color: colors.accent,
    fontFamily: fonts.headline,
    fontSize: 18,
    letterSpacing: 0.5,
  },
  xpTrack: {
    height: 8,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceHighlight,
    overflow: 'hidden',
  },
  xpFill: {
    height: 8,
    borderRadius: radius.full,
    backgroundColor: colors.accent,
  },
  levelMeta: {
    color: colors.textSecondary,
    fontFamily: fonts.body,
    fontSize: 11,
    marginTop: 6,
    fontVariant: ['tabular-nums'],
  },
  boardWrap: {
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  boardFrame: {
    padding: 8,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.accentDim,
    ...shadows.card,
  },
  statusArea: {
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  promptTitle: {
    color: colors.textPrimary,
    fontFamily: fonts.headline,
    fontSize: 20,
    letterSpacing: 0.5,
  },
  promptSub: {
    color: colors.textSecondary,
    fontFamily: fonts.body,
    fontSize: 13,
    marginTop: 4,
  },
  wrongText: {
    color: colors.danger,
    fontFamily: fonts.subheadline,
    fontSize: 15,
    letterSpacing: 0.5,
  },
  solvedRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  checkCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.success,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  solvedText: {
    color: colors.success,
    fontFamily: fonts.headline,
    fontSize: 20,
    letterSpacing: 0.5,
  },
  earnedText: {
    color: colors.gold,
    fontFamily: fonts.subheadline,
    fontSize: 15,
    marginLeft: spacing.md,
    fontVariant: ['tabular-nums'],
  },
  nextButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    minHeight: 52,
  },
  nextButtonText: {
    color: colors.bg,
    fontFamily: fonts.subheadline,
    fontSize: 16,
    letterSpacing: 0.5,
    marginRight: 4,
  },
  pressed: {
    opacity: 0.85,
  },
  primaryButton: {
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  primaryButtonText: {
    color: colors.bg,
    fontFamily: fonts.subheadline,
    fontSize: 16,
    letterSpacing: 0.5,
  },
  counter: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 12,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
});
