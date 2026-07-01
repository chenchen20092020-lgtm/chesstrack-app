import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
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
import { Chess, type Square } from 'chess.js';

import { colors, fonts, radius, shadows, spacing } from '@/lib/theme';
import {
  addPuzzleSolved,
  getPuzzleStats,
  PuzzleStats,
  XP_PER_LEVEL,
} from '@/lib/storage';
import { fetchLichessPuzzle, LichessPuzzle } from '@/lib/lichessPuzzles';

const BOARD_LIGHT = '#C9B79A';
const BOARD_DARK = '#3B332A';
const LICHESS_POINTS = 15;

const COMPLIMENTS = [
  'Nailed it!',
  'Brilliant!',
  'Sharp eyes!',
  'Clinical!',
  'Well calculated!',
  "That's the one!",
  'Crisp play!',
  'Textbook!',
  'You saw it!',
  'Excellent!',
];

// Difficulty ramps up as the player solves more puzzles this session.
function difficultyFor(solved: number): string {
  if (solved < 3) return 'easier';
  if (solved < 7) return 'normal';
  if (solved < 12) return 'harder';
  return 'hardest';
}

type Puzzle = {
  id: string;
  fen: string;
  solution: string[]; // UCI; solver plays even indices, opponent odd
  points: number;
  source: 'mistake' | 'lichess';
};

function parsePuzzles(raw: string | string[] | undefined): Puzzle[] {
  try {
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (!value) return [];
    const parsed = JSON.parse(value) as Puzzle[];
    return Array.isArray(parsed)
      ? parsed.filter((p) => p.fen && Array.isArray(p.solution) && p.solution.length > 0)
      : [];
  } catch {
    return [];
  }
}

function lichessToPuzzle(lp: LichessPuzzle): Puzzle {
  return { id: `l-${lp.id}`, fen: lp.fen, solution: lp.solution, points: LICHESS_POINTS, source: 'lichess' };
}

// Renders the targeted-puzzle trainer: solve, score XP, continue endlessly.
export default function PuzzlesScreen(): React.JSX.Element {
  const params = useLocalSearchParams<{ data?: string; angle?: string; difficulty?: string }>();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  const initialPuzzles = useMemo(() => parsePuzzles(params.data), [params.data]);
  const angle = Array.isArray(params.angle) ? params.angle[0] : params.angle;

  const [puzzles, setPuzzles] = useState<Puzzle[]>(initialPuzzles);
  const [index, setIndex] = useState(0);
  const [solved, setSolved] = useState(false);
  const [wrong, setWrong] = useState(false);
  const [earned, setEarned] = useState(0);
  const [compliment, setCompliment] = useState('');
  const [loadingNext, setLoadingNext] = useState(false);
  const [fetchError, setFetchError] = useState(false);
  const [stats, setStats] = useState<PuzzleStats>({ solved: 0, xp: 0, level: 1 });

  const boardRef = useRef<ChessboardRef>(null);
  const chessRef = useRef<Chess | null>(null);
  const solIdxRef = useRef(0);
  const lockRef = useRef(false);
  const puzzleRef = useRef<Puzzle | null>(null);
  const indexRef = useRef(0);
  const puzzlesRef = useRef<Puzzle[]>(initialPuzzles);
  const fetchingRef = useRef(false);
  const solvedCountRef = useRef(0);

  const puzzle = puzzles[index];

  useEffect(() => {
    indexRef.current = index;
  }, [index]);
  useEffect(() => {
    puzzlesRef.current = puzzles;
  }, [puzzles]);

  useEffect(() => {
    getPuzzleStats().then(setStats);
  }, []);

  // Set up the board and solving state whenever the current puzzle changes.
  useEffect(() => {
    if (!puzzle) return;
    puzzleRef.current = puzzle;
    try {
      chessRef.current = new Chess(puzzle.fen);
    } catch {
      chessRef.current = null;
    }
    solIdxRef.current = 0;
    lockRef.current = false;
    setSolved(false);
    setWrong(false);
    setEarned(0);
    boardRef.current?.resetBoard(puzzle.fen);
  }, [puzzle]);

  // When the player is on the last loaded puzzle, fetch the next one ahead of
  // time so the Next button stays instant.
  const prefetchIfLast = useCallback(() => {
    if (indexRef.current < puzzlesRef.current.length - 1) return;
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    fetchLichessPuzzle({ angle, difficulty: difficultyFor(solvedCountRef.current) }).then((lp) => {
      fetchingRef.current = false;
      if (lp) setPuzzles((prev) => [...prev, lichessToPuzzle(lp)]);
    });
  }, [angle]);

  const onMove = useCallback(
    (info: { move: { from: string; to: string; promotion?: string } }) => {
      const p = puzzleRef.current;
      const chess = chessRef.current;
      if (!p || !chess || lockRef.current) return;

      const sol = p.solution[solIdxRef.current];
      if (!sol) return;
      const from = sol.slice(0, 2);
      const to = sol.slice(2, 4);
      const promo = sol.slice(4, 5) || undefined;
      const ok =
        info.move.from === from &&
        info.move.to === to &&
        (!promo || info.move.promotion === promo);

      if (!ok) {
        setWrong(true);
        lockRef.current = true;
        setTimeout(() => {
          boardRef.current?.resetBoard(chess.fen());
          lockRef.current = false;
        }, 500);
        return;
      }

      setWrong(false);
      try {
        chess.move({ from, to, promotion: promo });
      } catch {
        // ignore — board already reflects the move
      }
      solIdxRef.current += 1;

      // Solved when no solver moves remain.
      if (solIdxRef.current >= p.solution.length) {
        lockRef.current = true;
        solvedCountRef.current += 1;
        setSolved(true);
        setEarned(p.points);
        setCompliment(COMPLIMENTS[Math.floor(Math.random() * COMPLIMENTS.length)]);
        addPuzzleSolved(p.points).then(setStats);
        prefetchIfLast();
        return;
      }

      // Auto-play the opponent's forced reply, then let the player continue.
      const reply = p.solution[solIdxRef.current];
      const rFrom = reply.slice(0, 2);
      const rTo = reply.slice(2, 4);
      const rPromo = reply.slice(4, 5) || undefined;
      lockRef.current = true;
      setTimeout(() => {
        try {
          chess.move({ from: rFrom, to: rTo, promotion: rPromo });
        } catch {
          // ignore
        }
        boardRef.current?.move({ from: rFrom as Square, to: rTo as Square });
        solIdxRef.current += 1;
        lockRef.current = false;
      }, 300);
    },
    [prefetchIfLast]
  );

  const goNext = useCallback(async () => {
    setFetchError(false);
    if (index + 1 < puzzles.length) {
      setIndex(index + 1);
      return;
    }
    setLoadingNext(true);
    const lp = await fetchLichessPuzzle({ angle, difficulty: difficultyFor(solvedCountRef.current) });
    setLoadingNext(false);
    if (lp) {
      setPuzzles((prev) => [...prev, lichessToPuzzle(lp)]);
      setIndex((i) => i + 1);
    } else {
      setFetchError(true);
    }
  }, [index, puzzles.length, angle]);

  const sideToMove = puzzle && puzzle.fen.split(' ')[1] === 'b' ? 'Black' : 'White';
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
            <Text style={styles.solvedText}>{compliment || 'Correct!'}</Text>
            <Text style={styles.earnedText}>+{earned} XP</Text>
          </MotiView>
        ) : wrong ? (
          <Text style={styles.wrongText}>Not the move — try again.</Text>
        ) : (
          <>
            <Text style={styles.promptTitle}>{sideToMove} to move</Text>
            <Text style={styles.promptSub}>
              {puzzle.source === 'mistake'
                ? 'Find the move you missed in this position'
                : 'Find the best move'}
            </Text>
          </>
        )}
      </View>

      {solved ? (
        <Pressable
          onPress={goNext}
          disabled={loadingNext}
          accessibilityRole="button"
          style={({ pressed }) => [styles.nextButton, pressed && styles.pressed]}
        >
          {loadingNext ? (
            <ActivityIndicator size="small" color={colors.bg} />
          ) : (
            <>
              <Text style={styles.nextButtonText}>Next puzzle</Text>
              <Ionicons name="chevron-forward" size={22} color={colors.bg} />
            </>
          )}
        </Pressable>
      ) : (
        <Text style={styles.counter}>
          {puzzle.source === 'mistake' ? 'From your game' : 'Tactics training'} · #{index + 1}
        </Text>
      )}
      {fetchError ? (
        <Text style={styles.errorText}>Couldn’t load the next puzzle — check your connection.</Text>
      ) : null}
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
  },
  errorText: {
    color: colors.danger,
    fontFamily: fonts.body,
    fontSize: 12,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
});
