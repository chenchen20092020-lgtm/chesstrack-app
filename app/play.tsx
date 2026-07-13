import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { FontAwesome5, Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import Chessboard, { type ChessboardRef } from 'react-native-chessboard';
import { MotiView } from 'moti';
import { Chess, type Move, type Square } from 'chess.js';

import { colors, fonts, radius, shadows, spacing } from '@/lib/theme';
import { GameEntry, getGames, getRatings, saveGames } from '@/lib/storage';
import { BotProfile, getBotMove, profileForRating } from '@/lib/bot';
import { useBoardTheme } from '@/lib/boardTheme';
import { hapticError, hapticLight, hapticMedium, hapticSuccess } from '@/lib/haptics';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const MIN_BOT_THINK_MS = 550;

type Phase = 'setup' | 'playing' | 'over';
type SideChoice = 'w' | 'b' | 'random';
type StrengthChoice = 'easier' | 'matched' | 'harder';

const STRENGTH_OFFSET: Record<StrengthChoice, number> = {
  easier: -150,
  matched: 0,
  harder: 150,
};

// Renders "Train with a Formidable Opponent": play a bot matched to your rating.
export default function PlayBotScreen(): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const boardTheme = useBoardTheme();

  const [phase, setPhase] = useState<Phase>('setup');
  const [sideChoice, setSideChoice] = useState<SideChoice>('random');
  const [strength, setStrength] = useState<StrengthChoice>('matched');
  const [userRating, setUserRating] = useState<number>(1200);
  const [userColor, setUserColor] = useState<'w' | 'b'>('w');
  const [botThinking, setBotThinking] = useState(false);
  const [lastMoveSan, setLastMoveSan] = useState('');
  const [plyCount, setPlyCount] = useState(0);
  const [resultText, setResultText] = useState('');
  const [userResult, setUserResult] = useState<'win' | 'loss' | 'draw'>('draw');

  const boardRef = useRef<ChessboardRef>(null);
  const mirrorRef = useRef<Chess>(new Chess());
  const profileRef = useRef<BotProfile>(profileForRating(1200));
  const userColorRef = useRef<'w' | 'b'>('w');
  const phaseRef = useRef<Phase>('setup');
  const botBusyRef = useRef(false);
  const mountedRef = useRef(true);
  const savedGameRef = useRef<GameEntry | null>(null);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    mountedRef.current = true;
    getRatings().then((entries) => {
      if (mountedRef.current && entries.length > 0) {
        setUserRating(entries[entries.length - 1].rating);
      }
    });
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const targetRating = Math.max(400, userRating + STRENGTH_OFFSET[strength]);
  const botName = `Formidable (~${profileForRating(targetRating).approxRating})`;

  // Ends the game: records the result, builds the PGN, saves to History.
  const finishGame = useCallback(
    async (result: 'win' | 'loss' | 'draw', reason: string) => {
      if (phaseRef.current !== 'playing') return;
      // Update the ref synchronously so a concurrent path can't finish twice.
      phaseRef.current = 'over';
      if (result === 'win') hapticSuccess();
      else if (result === 'loss') hapticError();
      else hapticMedium();
      setBotThinking(false);
      setUserResult(result);
      setResultText(reason);
      setPhase('over');

      try {
        const mirror = mirrorRef.current;
        const profile = profileRef.current;
        const resultTag =
          result === 'draw' ? '1/2-1/2' : (result === 'win') === (userColorRef.current === 'w') ? '1-0' : '0-1';
        mirror.header(
          'Event', 'ChessTrack Training',
          'White', userColorRef.current === 'w' ? 'You' : `Formidable (~${profile.approxRating})`,
          'Black', userColorRef.current === 'b' ? 'You' : `Formidable (~${profile.approxRating})`,
          'Result', resultTag
        );
        const entry: GameEntry = {
          id: `bot-${Date.now()}`,
          date: new Date().toISOString(),
          opponent: `Formidable (~${profile.approxRating})`,
          result,
          myRating: userRating,
          platform: 'Bot',
          timeControl: 'Training',
          pgn: mirror.pgn(),
        };
        const existing = await getGames();
        await saveGames([entry, ...existing]);
        savedGameRef.current = entry;
      } catch {
        savedGameRef.current = null;
      }
    },
    [userRating]
  );

  // Checks the mirror for game over; returns true when the game ended.
  const checkGameOver = useCallback(
    (lastMover: 'user' | 'bot'): boolean => {
      const mirror = mirrorRef.current;
      if (!mirror.isGameOver()) return false;
      if (mirror.isCheckmate()) {
        if (lastMover === 'user') {
          finishGame('win', 'Checkmate — you win!');
        } else {
          finishGame('loss', 'Checkmate — the bot got you this time.');
        }
      } else if (mirror.isStalemate()) {
        finishGame('draw', 'Stalemate — a draw.');
      } else if (mirror.isThreefoldRepetition()) {
        finishGame('draw', 'Draw by repetition.');
      } else if (mirror.isInsufficientMaterial()) {
        finishGame('draw', 'Draw — not enough material to mate.');
      } else {
        finishGame('draw', 'Draw.');
      }
      return true;
    },
    [finishGame]
  );

  // Plays the bot's reply for the current position.
  const playBotTurn = useCallback(async () => {
    if (botBusyRef.current || phaseRef.current !== 'playing') return;
    botBusyRef.current = true;
    setBotThinking(true);

    const started = Date.now();
    const mirror = mirrorRef.current;
    const move = await getBotMove(mirror.fen(), profileRef.current);
    const remaining = Math.max(0, MIN_BOT_THINK_MS - (Date.now() - started));
    await new Promise((resolve) => setTimeout(resolve, remaining));

    if (!mountedRef.current || phaseRef.current !== 'playing') {
      botBusyRef.current = false;
      return;
    }
    if (!move) {
      botBusyRef.current = false;
      setBotThinking(false);
      checkGameOver('user');
      return;
    }

    let applied: Move | null = null;
    try {
      applied = mirror.move({ from: move.from, to: move.to, promotion: move.promotion ?? 'q' });
    } catch {
      applied = null;
    }
    if (!applied) {
      botBusyRef.current = false;
      setBotThinking(false);
      return;
    }

    const boardMove = await boardRef.current?.move({
      from: move.from as Square,
      to: move.to as Square,
    });
    if (!boardMove) {
      // Keep the board in sync if the animated move failed (e.g. promotion).
      boardRef.current?.resetBoard(mirror.fen());
    }

    if (!mountedRef.current) {
      botBusyRef.current = false;
      return;
    }
    setLastMoveSan(applied.san);
    setPlyCount(mirror.history().length);
    setBotThinking(false);
    botBusyRef.current = false;
    checkGameOver('bot');
  }, [checkGameOver]);

  // Handles the user's move from the board.
  const onMove = useCallback(
    (info: { move: Move }) => {
      const mirror = mirrorRef.current;
      if (info.move.color !== userColorRef.current) {
        // The board fires onMove for programmatic moves too: ignore the echo
        // of the bot's own animated move (already applied to the mirror).
        const last = mirror.history({ verbose: true }).slice(-1)[0];
        if (last && last.from === info.move.from && last.to === info.move.to) {
          return;
        }
        // Otherwise the user dragged the bot's piece — snap back.
        boardRef.current?.resetBoard(mirror.fen());
        return;
      }
      if (phaseRef.current !== 'playing' || botBusyRef.current) {
        boardRef.current?.resetBoard(mirror.fen());
        return;
      }
      try {
        mirror.move({ from: info.move.from, to: info.move.to, promotion: info.move.promotion });
      } catch {
        boardRef.current?.resetBoard(mirror.fen());
        return;
      }
      hapticLight();
      setLastMoveSan(info.move.san);
      setPlyCount(mirror.history().length);
      if (checkGameOver('user')) return;
      playBotTurn();
    },
    [checkGameOver, playBotTurn]
  );

  // Starts (or restarts) a game with the current setup.
  const startGame = useCallback(() => {
    const color: 'w' | 'b' =
      sideChoice === 'random' ? (Math.random() < 0.5 ? 'w' : 'b') : sideChoice;
    userColorRef.current = color;
    profileRef.current = profileForRating(Math.max(400, userRating + STRENGTH_OFFSET[strength]));
    mirrorRef.current = new Chess();
    savedGameRef.current = null;
    setUserColor(color);
    setLastMoveSan('');
    setPlyCount(0);
    setResultText('');
    setBotThinking(false);
    botBusyRef.current = false;
    boardRef.current?.resetBoard(START_FEN);
    setPhase('playing');
    phaseRef.current = 'playing';
    if (color === 'b') {
      playBotTurn();
    }
  }, [sideChoice, strength, userRating, playBotTurn]);

  const confirmResign = useCallback(() => {
    Alert.alert('Resign this game?', 'It will be saved as a loss.', [
      { text: 'Keep playing', style: 'cancel' },
      {
        text: 'Resign',
        style: 'destructive',
        onPress: () => finishGame('loss', 'You resigned. Every game is a lesson.'),
      },
    ]);
  }, [finishGame]);

  const analyzeGame = useCallback(() => {
    const saved = savedGameRef.current;
    if (!saved) return;
    router.push({
      pathname: '/game-review',
      params: { gameData: JSON.stringify(saved), platform: saved.platform },
    });
  }, []);

  const boardSize = Math.min(width - spacing.lg * 2 - 16, 360);

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
          <Text style={styles.backText}>Back</Text>
        </Pressable>

        {phase === 'setup' ? (
          <>
            <Text style={styles.title}>Formidable Opponent</Text>
            <Text style={styles.subtitle}>
              A bot tuned to your strength (~{profileForRating(targetRating).approxRating}). Beating
              your equal is how you climb.
            </Text>

            <Text style={styles.label}>Your side</Text>
            <View style={styles.chipRow}>
              {(
                [
                  { key: 'w' as const, label: 'White' },
                  { key: 'b' as const, label: 'Black' },
                  { key: 'random' as const, label: 'Random' },
                ]
              ).map((opt) => (
                <Pressable
                  key={opt.key}
                  onPress={() => setSideChoice(opt.key)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: sideChoice === opt.key }}
                  style={({ pressed }) => [
                    styles.chip,
                    sideChoice === opt.key ? styles.chipActive : styles.chipInactive,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={[styles.chipText, sideChoice === opt.key && styles.chipTextActive]}>
                    {opt.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.label}>Bot strength</Text>
            <View style={styles.chipRow}>
              {(
                [
                  { key: 'easier' as const, label: 'Warm-up' },
                  { key: 'matched' as const, label: 'Matched' },
                  { key: 'harder' as const, label: 'Stretch' },
                ]
              ).map((opt) => (
                <Pressable
                  key={opt.key}
                  onPress={() => setStrength(opt.key)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: strength === opt.key }}
                  style={({ pressed }) => [
                    styles.chip,
                    strength === opt.key ? styles.chipActive : styles.chipInactive,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={[styles.chipText, strength === opt.key && styles.chipTextActive]}>
                    {opt.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Pressable
              onPress={startGame}
              accessibilityRole="button"
              style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
            >
              <FontAwesome5 name="robot" size={16} color={colors.bg} />
              <Text style={styles.primaryButtonText}>Start Game</Text>
            </Pressable>
            <Text style={styles.note}>
              Finished games are saved to History, so you can analyze them and run your Habit Check.
            </Text>
          </>
        ) : (
          <>
            <View style={styles.matchHeader}>
              <View style={styles.matchInfo}>
                <Text style={styles.matchBot}>{botName}</Text>
                <Text style={styles.matchMeta}>
                  You play {userColor === 'w' ? 'White' : 'Black'} · {Math.ceil(plyCount / 2)} moves
                </Text>
              </View>
              {phase === 'playing' ? (
                <Pressable
                  onPress={confirmResign}
                  accessibilityRole="button"
                  style={({ pressed }) => [styles.resignButton, pressed && styles.pressed]}
                >
                  <Text style={styles.resignText}>Resign</Text>
                </Pressable>
              ) : null}
            </View>

            <View style={styles.boardWrap}>
              <View style={styles.boardFrame}>
                <Chessboard
                  ref={boardRef}
                  boardSize={boardSize}
                  gestureEnabled={phase === 'playing'}
                  fen={START_FEN}
                  onMove={onMove}
                  durations={{ move: 160 }}
                  colors={{
                    white: boardTheme.light,
                    black: boardTheme.dark,
                    lastMoveHighlight: 'rgba(201, 183, 133, 0.38)',
                    checkmateHighlight: 'rgba(224, 106, 94, 0.55)',
                  }}
                />
              </View>
            </View>

            <View style={styles.statusArea}>
              {phase === 'over' ? (
                <MotiView
                  from={{ scale: 0.7, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: 'spring', damping: 12, stiffness: 160 }}
                  style={styles.resultWrap}
                >
                  <View
                    style={[
                      styles.resultCircle,
                      {
                        backgroundColor:
                          userResult === 'win'
                            ? colors.success
                            : userResult === 'loss'
                              ? colors.danger
                              : colors.textSecondary,
                      },
                    ]}
                  >
                    <Ionicons
                      name={userResult === 'win' ? 'trophy' : userResult === 'loss' ? 'school' : 'remove'}
                      size={20}
                      color={colors.bg}
                    />
                  </View>
                  <Text style={styles.resultText}>{resultText}</Text>
                </MotiView>
              ) : botThinking ? (
                <View style={styles.thinkingRow}>
                  <ActivityIndicator size="small" color={colors.accent} />
                  <Text style={styles.thinkingText}>Formidable is thinking…</Text>
                </View>
              ) : (
                <Text style={styles.turnText}>
                  Your move{lastMoveSan ? ` · last: ${lastMoveSan}` : ''}
                </Text>
              )}
            </View>

            {phase === 'over' ? (
              <View style={styles.overActions}>
                {savedGameRef.current && plyCount >= 4 ? (
                  <Pressable
                    onPress={analyzeGame}
                    accessibilityRole="button"
                    style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
                  >
                    <Ionicons name="analytics" size={18} color={colors.bg} />
                    <Text style={styles.primaryButtonText}>Analyze This Game</Text>
                  </Pressable>
                ) : null}
                <Pressable
                  onPress={startGame}
                  accessibilityRole="button"
                  style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
                >
                  <Text style={styles.secondaryButtonText}>Rematch</Text>
                </Pressable>
              </View>
            ) : null}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    paddingHorizontal: spacing.lg,
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
    opacity: 0.75,
  },
  title: {
    color: colors.textPrimary,
    fontFamily: fonts.headline,
    fontSize: 32,
    letterSpacing: 0.5,
    marginBottom: spacing.xs,
  },
  subtitle: {
    color: colors.textSecondary,
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 21,
    marginBottom: spacing.xl,
  },
  label: {
    color: colors.textMuted,
    fontFamily: fonts.ui,
    fontSize: 10,
    letterSpacing: 2,
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
  },
  chipRow: {
    flexDirection: 'row',
    marginBottom: spacing.lg,
  },
  chip: {
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  chipInactive: {
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: {
    backgroundColor: colors.accent,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  chipText: {
    color: colors.textSecondary,
    fontFamily: fonts.ui,
    fontSize: 13,
  },
  chipTextActive: {
    color: colors.bg,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    minHeight: 52,
    marginTop: spacing.sm,
    ...shadows.accent,
  },
  primaryButtonText: {
    color: colors.bg,
    fontFamily: fonts.subheadline,
    fontSize: 16,
    letterSpacing: 0.5,
    marginLeft: spacing.sm,
  },
  secondaryButton: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceRaised,
    marginTop: spacing.sm,
  },
  secondaryButtonText: {
    color: colors.textPrimary,
    fontFamily: fonts.ui,
    fontSize: 14,
  },
  note: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 11,
    lineHeight: 16,
    marginTop: spacing.md,
    textAlign: 'center',
  },
  matchHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  matchInfo: {
    flex: 1,
  },
  matchBot: {
    color: colors.textPrimary,
    fontFamily: fonts.headline,
    fontSize: 20,
    letterSpacing: 0.5,
  },
  matchMeta: {
    color: colors.textSecondary,
    fontFamily: fonts.body,
    fontSize: 12,
    marginTop: 2,
    fontVariant: ['tabular-nums'],
  },
  resignButton: {
    minHeight: 40,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
  },
  resignText: {
    color: colors.danger,
    fontFamily: fonts.ui,
    fontSize: 13,
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
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  turnText: {
    color: colors.textPrimary,
    fontFamily: fonts.subheadline,
    fontSize: 15,
    letterSpacing: 0.5,
  },
  thinkingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  thinkingText: {
    color: colors.textSecondary,
    fontFamily: fonts.body,
    fontSize: 14,
  },
  resultWrap: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  resultCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  resultText: {
    flex: 1,
    color: colors.textPrimary,
    fontFamily: fonts.headline,
    fontSize: 17,
    letterSpacing: 0.5,
  },
  overActions: {
    marginTop: spacing.sm,
  },
});
