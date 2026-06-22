import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import Chessboard from 'react-native-chessboard';
import type { AudioRecorder } from 'expo-audio';

import { colors, fonts, radius, shadows, spacing } from '@/lib/theme';
import {
  fetchChessComGameMoves,
  fetchLichessGameMoves,
  GameReview,
  GameReviewFlag,
} from '@/lib/api';
import { ALL_TAGS, GameTag, TAG_LABELS, tagGame } from '@/lib/storage';
import {
  analyzeGame,
  describeMistake,
  estimateAccuracy,
  MoveJudgement,
} from '@/lib/engine';
import {
  isOnline,
  startRecording,
  stopRecording,
  summarizeTranscription,
  transcribeAudio,
} from '@/lib/voiceToText';

type RecordingStatus =
  | 'idle'
  | 'recording'
  | 'transcribing'
  | 'done'
  | 'error';

type SummaryFormat = 'bullets' | 'paragraph' | 'raw';

type HistoryGame = {
  id: string;
  date: string;
  opponent: string;
  result: 'win' | 'loss' | 'draw';
  myRating: number;
  platform: 'Chess.com' | 'Lichess';
  timeControl: string;
  pgn?: string;
  tags?: GameTag[];
  reflection?: string;
  reviewed?: boolean;
};

// Parses JSON gameData safely from route params.
function parseGameDataParam(raw: string | string[] | undefined): HistoryGame | null {
  try {
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (!value) return null;
    const parsed = JSON.parse(value) as HistoryGame;
    if (!parsed?.id || !parsed?.platform) return null;
    return parsed;
  } catch {
    return null;
  }
}

// Converts stored game id into Lichess id when possible.
function getLichessGameId(game: HistoryGame): string | null {
  const rawId = game.id.replace(/^lichess-/, '').trim();
  return rawId || null;
}

// Returns a friendly subtitle for the header.
function getHeaderSubtitle(review: GameReview): string {
  return `${review.white} vs ${review.black} · ${review.result} · ${review.date}`;
}

// Returns flag card accent color for a flag type.
function getFlagColor(type: string): string {
  if (type === 'time') return colors.danger;
  if (type === 'opening') return colors.danger;
  if (type === 'development' || type === 'king') return colors.warning;
  return colors.accent;
}

// Renders the interactive game review screen.
export default function GameReviewScreen(): React.JSX.Element {
  const params = useLocalSearchParams<{ gameData?: string; platform?: string }>();
  const gameData = useMemo(() => parseGameDataParam(params.gameData), [params.gameData]);
  const { width } = useWindowDimensions();
  const chipsRef = useRef<ScrollView | null>(null);

  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');
  const [review, setReview] = useState<GameReview | null>(null);
  const [moveIndex, setMoveIndex] = useState<number>(0);
  const [currentFen, setCurrentFen] = useState<string>(
    'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
  );
  const [selectedTags, setSelectedTags] = useState<GameTag[]>(gameData?.tags ?? []);
  const [reflection, setReflection] = useState<string>(gameData?.reflection ?? '');
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);
  const [savingTags, setSavingTags] = useState<boolean>(false);
  const [recorder, setRecorder] = useState<AudioRecorder | null>(null);
  const [recordingStatus, setRecordingStatus] =
    useState<RecordingStatus>('idle');
  const [recordingStatusDetail, setRecordingStatusDetail] =
    useState<string>('');
  const [transcribedText, setTranscribedText] = useState<string | null>(null);
  const [summaryFormat, setSummaryFormat] = useState<SummaryFormat | null>(
    null
  );
  const [summarizing, setSummarizing] = useState<boolean>(false);
  const [summaryError, setSummaryError] = useState<string>('');
  const resetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [engineStatus, setEngineStatus] = useState<'idle' | 'analyzing' | 'done' | 'error'>('idle');
  const [engineProgress, setEngineProgress] = useState<number>(0);
  const [judgements, setJudgements] = useState<MoveJudgement[]>([]);

  // Clears any pending status reset timer when the screen unmounts.
  useEffect(() => {
    return () => {
      if (resetTimeoutRef.current) {
        clearTimeout(resetTimeoutRef.current);
      }
    };
  }, []);

  // Schedules a return to the idle state after the given delay.
  const scheduleRecordingReset = useCallback((delayMs: number) => {
    if (resetTimeoutRef.current) {
      clearTimeout(resetTimeoutRef.current);
    }
    resetTimeoutRef.current = setTimeout(() => {
      setRecordingStatus('idle');
      setRecordingStatusDetail('');
    }, delayMs);
  }, []);

  // Begins recording, handling permission denial gracefully.
  const handleStartRecording = useCallback(async () => {
    const newRecorder = await startRecording();
    if (!newRecorder) {
      Alert.alert(
        'Microphone permission denied',
        'Enable it in settings.'
      );
      return;
    }
    setRecorder(newRecorder);
    setRecordingStatus('recording');
    setRecordingStatusDetail('');
  }, []);

  // Stops recording, transcribes with Groq, and appends text to the reflection.
  const handleStopAndTranscribe = useCallback(async () => {
    if (!recorder) {
      return;
    }
    setRecordingStatus('transcribing');
    setRecordingStatusDetail('');

    const uri = await stopRecording(recorder);
    setRecorder(null);

    if (!uri) {
      setRecordingStatus('error');
      scheduleRecordingReset(3000);
      return;
    }

    const online = await isOnline();
    if (!online) {
      setRecordingStatus('error');
      setRecordingStatusDetail(
        'No internet. Voice transcription requires internet.'
      );
      scheduleRecordingReset(3000);
      return;
    }

    const text = await transcribeAudio(uri);
    if (!text) {
      setRecordingStatus('error');
      scheduleRecordingReset(3000);
      return;
    }

    // Park the transcription for the user to pick a summary format.
    setTranscribedText(text);
    setSummaryFormat(null);
    setSummaryError('');
    setRecordingStatus('done');
    setRecordingStatusDetail('');
  }, [recorder, scheduleRecordingReset]);

  // Appends the given text to the reflection, separated by a space.
  const appendToReflection = useCallback((text: string) => {
    setReflection((prev) => (prev ? `${prev} ${text}` : text));
  }, []);

  // Resets the format-pill state and returns the mic UI to idle.
  const clearSummaryState = useCallback(() => {
    setTranscribedText(null);
    setSummaryFormat(null);
    setSummarizing(false);
    setRecordingStatus('idle');
    setRecordingStatusDetail('');
  }, []);

  // Handles the user picking one of the three summary formats.
  const handleSummaryFormatSelect = useCallback(
    async (format: SummaryFormat) => {
      if (!transcribedText || summarizing) {
        return;
      }
      setSummaryFormat(format);
      setSummaryError('');

      if (format === 'raw') {
        appendToReflection(transcribedText);
        clearSummaryState();
        return;
      }

      setSummarizing(true);
      const summary = await summarizeTranscription(transcribedText, format);
      setSummarizing(false);

      if (summary) {
        appendToReflection(summary);
      } else {
        appendToReflection(transcribedText);
        setSummaryError('Summarization failed. Raw text added instead.');
        setTimeout(() => setSummaryError(''), 3000);
      }
      clearSummaryState();
    },
    [
      appendToReflection,
      clearSummaryState,
      summarizing,
      transcribedText,
    ]
  );

  // Toggles the mic between start, stop, and a disabled transcribing state.
  const handleMicPress = useCallback(async () => {
    if (recordingStatus === 'transcribing' || transcribedText) {
      return;
    }
    if (recordingStatus === 'recording') {
      await handleStopAndTranscribe();
      return;
    }
    await handleStartRecording();
  }, [
    handleStartRecording,
    handleStopAndTranscribe,
    recordingStatus,
    transcribedText,
  ]);

  // Syncs currentFen whenever moveIndex or review changes.
  useEffect(() => {
    if (review && review.moves[moveIndex]) {
      setCurrentFen(review.moves[moveIndex].fen);
    } else if (moveIndex === 0) {
      setCurrentFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
    }
  }, [moveIndex, review]);

  // Loads review data using the selected platform.
  const loadReview = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      if (!gameData) {
        setError('Could not load this game. Please open it again from History.');
        setLoading(false);
        return;
      }

      let next: GameReview | null = null;
      if (gameData.platform === 'Chess.com') {
        const pgn = gameData.pgn?.trim() ?? '';
        if (!pgn) {
          setError("This game's moves are not available. Try syncing your games again.");
          setLoading(false);
          return;
        }
        next = await fetchChessComGameMoves(pgn, gameData.result);
      } else {
        const gameId = getLichessGameId(gameData);
        if (gameId) {
          next = await fetchLichessGameMoves(gameId, gameData.result);
        }
      }

      if (!next) {
        setError('Could not review this game yet. Try another game from your history.');
        setLoading(false);
        return;
      }

      setReview(next);
      setMoveIndex(0);
      setCurrentFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
    } catch {
      setError('Something went wrong while reviewing this game.');
    } finally {
      setLoading(false);
    }
  }, [gameData]);

  useEffect(() => {
    loadReview();
  }, [loadReview]);

  // Determine which colour the user played — the side that isn't the opponent.
  const userColor: 'w' | 'b' = useMemo(() => {
    if (!review) return 'w';
    const opp = (gameData?.opponent ?? '').toLowerCase();
    if (opp && review.white.toLowerCase() === opp) return 'b';
    return 'w';
  }, [review, gameData?.opponent]);

  // Run Stockfish analysis once the moves are loaded.
  useEffect(() => {
    if (!review || review.moves.length === 0) return;
    let cancelled = false;
    setEngineStatus('analyzing');
    setEngineProgress(0);
    setJudgements([]);
    analyzeGame(review.moves, {
      onProgress: (d, t) => {
        if (!cancelled) setEngineProgress(Math.round((d / t) * 100));
      },
    })
      .then((result) => {
        if (cancelled) return;
        if (!result) {
          setEngineStatus('error');
          return;
        }
        setJudgements(result.judgements);
        setEngineStatus('done');
      })
      .catch(() => {
        if (!cancelled) setEngineStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, [review]);

  const userMistakes = useMemo(
    () =>
      judgements
        .filter((j) => j.color === userColor && j.classification !== 'good')
        .sort((a, b) => b.cpl - a.cpl),
    [judgements, userColor]
  );
  const accuracy = useMemo(
    () => estimateAccuracy(judgements, userColor),
    [judgements, userColor]
  );
  const mistakeCounts = useMemo(() => {
    const counts = { blunder: 0, mistake: 0, inaccuracy: 0 };
    userMistakes.forEach((j) => {
      if (j.classification !== 'good') counts[j.classification] += 1;
    });
    return counts;
  }, [userMistakes]);

  // Keeps the chips row scrolled near the current move pair.
  useEffect(() => {
    if (!chipsRef.current || !review) return;
    const chipWidth = 110;
    const pairIdx = moveIndex > 0 ? Math.floor((moveIndex - 1) / 2) : 0;
    const x = Math.max(0, pairIdx * chipWidth - width / 3);
    chipsRef.current.scrollTo({ x, y: 0, animated: true });
  }, [moveIndex, review, width]);

  const totalMoves = review?.moves.length ?? 0;

  const flaggedByIndex = useMemo(() => {
    const map = new Map<number, GameReviewFlag[]>();
    (review?.flags ?? []).forEach((flag) => {
      const existing = map.get(flag.moveIndex) ?? [];
      existing.push(flag);
      map.set(flag.moveIndex, existing);
    });
    return map;
  }, [review?.flags]);

  // Moves board to the selected index while keeping bounds safe.
  const jumpToMove = useCallback(
    (index: number) => {
      if (!review) return;
      setMoveIndex(Math.max(0, Math.min(index, review.moves.length)));
    },
    [review]
  );

  if (loading) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="small" color={colors.accent} />
        <Text style={styles.loadingText}>Reviewing game...</Text>
      </View>
    );
  }

  if (!review) {
    return (
      <View style={styles.errorWrap}>
        <Pressable onPress={() => router.back()} style={styles.backRow}>
          <Ionicons name="chevron-back" size={18} color={colors.accent} />
          <Text style={styles.backLabel}>Back</Text>
        </Pressable>
        <Text style={styles.errorTitle}>Game Review</Text>
        <Text style={styles.errorBody}>{error || 'Unable to load this game.'}</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <Pressable onPress={() => router.back()} style={styles.backRow}>
          <Ionicons name="chevron-back" size={18} color={colors.accent} />
          <Text style={styles.backLabel}>Back</Text>
        </Pressable>
      </View>
      <Text style={styles.title}>Game Review</Text>
      <Text style={styles.subtitle}>{getHeaderSubtitle(review)}</Text>

      <View style={styles.boardWrap}>
        <Chessboard
          key={currentFen}
          boardSize={Math.min(width - spacing.lg * 2, 380)}
          gestureEnabled={false}
          fen={currentFen}
          colors={{ white: colors.accent, black: colors.surfaceRaised }}
        />
      </View>

      <View style={styles.controlsRow}>
        <Pressable style={styles.ctrlButton} onPress={() => jumpToMove(0)}>
          <Ionicons name="play-skip-back" size={28} color={colors.accent} />
        </Pressable>
        <Pressable style={styles.ctrlButton} onPress={() => jumpToMove(moveIndex - 1)}>
          <Ionicons name="play-back" size={28} color={colors.accent} />
        </Pressable>
        <View style={styles.counterWrap}>
          {moveIndex === 0 ? (
            <Text style={styles.counterText}>Start</Text>
          ) : moveIndex % 2 === 1 ? (
            <>
              <Text style={styles.counterText}>Move {Math.ceil(moveIndex / 2)}</Text>
              <Text style={styles.counterMove}>{review.moves[moveIndex - 1]?.move}</Text>
            </>
          ) : (
            <>
              <Text style={styles.counterText}>Move {moveIndex / 2}.1</Text>
              <Text style={styles.counterMove}>{review.moves[moveIndex - 1]?.move}</Text>
            </>
          )}
        </View>
        <Pressable style={styles.ctrlButton} onPress={() => jumpToMove(moveIndex + 1)}>
          <Ionicons name="play-forward" size={28} color={colors.accent} />
        </Pressable>
        <Pressable style={styles.ctrlButton} onPress={() => jumpToMove(totalMoves)}>
          <Ionicons name="play-skip-forward" size={28} color={colors.accent} />
        </Pressable>
      </View>

      <Text style={styles.sectionSubTitle}>Moves</Text>
      <ScrollView
        ref={(ref) => {
          chipsRef.current = ref;
        }}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipsRow}
      >
        {Array.from({ length: Math.ceil((review.moves ?? []).length / 2) }, (_, pairIdx) => {
          const whiteIdx = pairIdx * 2; // 0-based index in moves array
          const blackIdx = pairIdx * 2 + 1;
          const whiteMv = review.moves[whiteIdx];
          const blackMv = review.moves[blackIdx];
          const moveNumber = pairIdx + 1;
          // ply indices (1-based): white = whiteIdx+1, black = blackIdx+1
          const whitePly = whiteIdx + 1;
          const blackPly = blackIdx + 1;
          const isCurrent = moveIndex === whitePly || moveIndex === blackPly;
          const isFlagged = flaggedByIndex.has(whiteIdx) || (blackMv && flaggedByIndex.has(blackIdx));
          const label = blackMv
            ? `${moveNumber}. ${whiteMv.move} ${blackMv.move}`
            : `${moveNumber}. ${whiteMv.move}`;
          return (
            <Pressable
              key={`pair-${pairIdx}`}
              onPress={() => jumpToMove(whitePly)}
              style={[
                styles.moveChip,
                isCurrent ? styles.moveChipCurrent : null,
                !isCurrent && isFlagged ? styles.moveChipFlagged : null,
              ]}
            >
              <Text
                style={[
                  styles.moveChipText,
                  isCurrent ? styles.moveChipTextCurrent : null,
                  !isCurrent && isFlagged ? styles.moveChipTextFlagged : null,
                ]}
              >
                {label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={styles.divider} />

      <Text style={styles.sectionTitle}>Engine Analysis</Text>
      {engineStatus === 'analyzing' ? (
        <View style={styles.engineLoading}>
          <ActivityIndicator size="small" color={colors.accent} />
          <Text style={styles.engineLoadingText}>
            Analyzing with Stockfish… {engineProgress}%
          </Text>
        </View>
      ) : engineStatus === 'error' ? (
        <Text style={styles.engineUnavailable}>
          Engine analysis is unavailable right now. Reopen the game to retry.
        </Text>
      ) : engineStatus === 'done' ? (
        <>
          <View style={styles.engineSummary}>
            <View style={styles.engineStat}>
              <Text style={styles.engineStatValue}>
                {accuracy != null ? `${accuracy}%` : '–'}
              </Text>
              <Text style={styles.engineStatLabel}>Accuracy</Text>
            </View>
            <View style={styles.engineStat}>
              <Text style={[styles.engineStatValue, { color: colors.danger }]}>
                {mistakeCounts.blunder}
              </Text>
              <Text style={styles.engineStatLabel}>Blunders</Text>
            </View>
            <View style={styles.engineStat}>
              <Text style={[styles.engineStatValue, { color: colors.warning }]}>
                {mistakeCounts.mistake}
              </Text>
              <Text style={styles.engineStatLabel}>Mistakes</Text>
            </View>
            <View style={styles.engineStat}>
              <Text style={styles.engineStatValue}>{mistakeCounts.inaccuracy}</Text>
              <Text style={styles.engineStatLabel}>Inaccuracies</Text>
            </View>
          </View>
          {userMistakes.length === 0 ? (
            <Text style={styles.engineClean}>
              No major mistakes — a clean game. Well played.
            </Text>
          ) : (
            userMistakes.slice(0, 6).map((j) => (
              <Pressable
                key={j.ply}
                onPress={() => jumpToMove(j.ply)}
                accessibilityRole="button"
                style={({ pressed }) => [styles.mistakeCard, pressed && styles.enginePressed]}
              >
                <View
                  style={[
                    styles.mistakeAccent,
                    {
                      backgroundColor:
                        j.classification === 'blunder'
                          ? colors.danger
                          : j.classification === 'mistake'
                            ? colors.warning
                            : colors.textSecondary,
                    },
                  ]}
                />
                <Text style={styles.mistakeText}>{describeMistake(j, userColor)}</Text>
              </Pressable>
            ))
          )}
          {userMistakes.length > 6 ? (
            <Text style={styles.engineMore}>
              +{userMistakes.length - 6} more — step through the moves to see them all.
            </Text>
          ) : null}
          <Text style={styles.engineCaption}>
            Evaluations from Stockfish. + favours you, − favours your opponent.
          </Text>
        </>
      ) : null}

      <View style={styles.divider} />

      <Text style={styles.sectionTitle}>What Happened</Text>
      {(review.insights ?? []).map((insight, idx) => (
        <View key={`${insight}-${idx}`} style={styles.insightRow}>
          <Text style={styles.insightBullet}>·</Text>
          <Text style={styles.insightText}>{insight}</Text>
        </View>
      ))}

      <Text style={styles.sectionTitle}>Your Patterns</Text>
      {review.flags.length === 0 ? (
        <Text style={styles.noPatterns}>No major patterns detected in this game.</Text>
      ) : (
        review.flags.map((flag, idx) => (
          <Pressable
            key={`${flag.type}-${flag.moveIndex}-${idx}`}
            onPress={() => jumpToMove(flag.moveIndex + 1)}
            style={styles.flagCard}
          >
            <View style={[styles.flagAccent, { backgroundColor: getFlagColor(flag.type) }]} />
            <View style={styles.flagBody}>
              <Text style={styles.flagLabel}>{flag.label}</Text>
              <Text style={styles.flagMove}>Move {flag.moveIndex + 1}</Text>
            </View>
          </Pressable>
        ))
      )}

      <View style={styles.recommendCard}>
        <Text style={styles.recommendLabel}>YOUR NEXT STEP</Text>
        <Text style={styles.recommendText}>{review.recommendation}</Text>
      </View>

      <View style={styles.taggingSection}>
        <Text style={styles.taggingTitle}>What Went Wrong?</Text>
        <Text style={styles.taggingSubtitle}>Tag this game to track your patterns</Text>

        <View style={styles.tagGrid}>
          {ALL_TAGS.map((tag) => {
            const active = selectedTags.includes(tag);
            return (
              <Pressable
                key={tag}
                onPress={() =>
                  setSelectedTags((prev) =>
                    prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
                  )
                }
                style={[styles.tagPill, active ? styles.tagPillActive : styles.tagPillInactive]}
              >
                <Text style={[styles.tagPillText, active ? styles.tagPillTextActive : null]}>
                  {TAG_LABELS[tag]}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.reflectionLabel}>One sentence reflection</Text>
        <View style={styles.reflectionRow}>
          <TextInput
            style={styles.reflectionInput}
            placeholder="What would you do differently?"
            placeholderTextColor={colors.textMuted}
            value={reflection}
            onChangeText={setReflection}
            multiline
            textAlignVertical="top"
          />
          <Pressable
            onPress={handleMicPress}
            disabled={recordingStatus === 'transcribing' || !!transcribedText}
            style={[
              styles.reflectionMicButton,
              recordingStatus === 'recording'
                ? styles.reflectionMicButtonRecording
                : null,
              recordingStatus === 'done'
                ? styles.reflectionMicButtonDone
                : null,
              recordingStatus === 'error'
                ? styles.reflectionMicButtonError
                : null,
            ]}
          >
            {recordingStatus === 'transcribing' ? (
              <ActivityIndicator size="small" color={colors.accent} />
            ) : (
              <Ionicons
                name={recordingStatus === 'recording' ? 'stop' : 'mic-outline'}
                size={20}
                color={
                  recordingStatus === 'recording' || recordingStatus === 'done'
                    ? '#FFFFFF'
                    : colors.textPrimary
                }
              />
            )}
          </Pressable>
        </View>
        {recordingStatus !== 'idle' ? (
          <Text
            style={[
              styles.recordingStatusText,
              recordingStatus === 'recording'
                ? { color: colors.danger }
                : recordingStatus === 'transcribing'
                ? { color: colors.accent }
                : recordingStatus === 'done'
                ? { color: colors.success }
                : { color: colors.danger },
            ]}
          >
            {recordingStatus === 'recording'
              ? 'Recording... tap to stop'
              : recordingStatus === 'transcribing'
              ? 'Transcribing with AI...'
              : recordingStatus === 'done'
              ? 'Transcribed!'
              : recordingStatusDetail || 'Failed. Try again.'}
          </Text>
        ) : null}

        {transcribedText ? (
          <View style={styles.summaryPillsWrap}>
            <View style={styles.summaryPillsRow}>
              {(
                [
                  { key: 'bullets' as const, label: '• Bullets' },
                  { key: 'paragraph' as const, label: '¶ Paragraph' },
                  { key: 'raw' as const, label: 'Raw' },
                ]
              ).map((option) => {
                const selected = summaryFormat === option.key;
                return (
                  <Pressable
                    key={option.key}
                    onPress={() => handleSummaryFormatSelect(option.key)}
                    disabled={summarizing}
                    style={[
                      styles.summaryPill,
                      selected ? styles.summaryPillSelected : null,
                    ]}
                  >
                    <Text
                      style={[
                        styles.summaryPillText,
                        selected ? styles.summaryPillTextSelected : null,
                      ]}
                    >
                      {option.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            {summarizing ? (
              <Text style={styles.summarizingInlineText}>Summarizing...</Text>
            ) : null}
          </View>
        ) : null}

        {summaryError ? (
          <Text style={styles.summaryErrorText}>{summaryError}</Text>
        ) : null}

        {saveSuccess ? (
          <Text style={styles.saveSuccessText}>
            Saved! This helps track your patterns.
          </Text>
        ) : null}

        <Pressable
          style={[styles.saveTagsButton, savingTags ? styles.saveTagsButtonDisabled : null]}
          disabled={savingTags}
          onPress={async () => {
            if (!gameData) return;
            setSavingTags(true);
            try {
              await tagGame(gameData.id, selectedTags, reflection);
              setSaveSuccess(true);
              setTimeout(() => setSaveSuccess(false), 2000);
            } finally {
              setSavingTags(false);
            }
          }}
        >
          <Text style={styles.saveTagsButtonText}>
            {gameData?.reviewed ? 'Update Reflection' : 'Save Reflection'}
          </Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xl,
  },
  loadingWrap: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  loadingText: {
    color: colors.accent,
    fontFamily: fonts.subheadline,
    fontSize: 18,
  },
  errorWrap: {
    flex: 1,
    backgroundColor: colors.bg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
  },
  errorTitle: {
    color: colors.textPrimary,
    fontFamily: fonts.headline,
    fontSize: 24,
    marginBottom: spacing.sm,
  },
  errorBody: {
    color: colors.textSecondary,
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 22,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  backLabel: {
    color: colors.accent,
    fontFamily: fonts.ui,
    fontSize: 14,
  },
  title: {
    color: colors.textPrimary,
    fontFamily: fonts.headline,
    fontSize: 24,
    marginBottom: 4,
  },
  subtitle: {
    color: colors.textSecondary,
    fontFamily: fonts.body,
    fontSize: 12,
    marginBottom: spacing.md,
  },
  boardWrap: {
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-evenly',
    paddingVertical: 16,
    paddingHorizontal: 8,
    marginBottom: spacing.md,
  },
  ctrlButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.surfaceRaised,
    justifyContent: 'center',
    alignItems: 'center',
  },
  counterWrap: {
    minWidth: 100,
    alignItems: 'center',
  },
  counterText: {
    color: colors.textPrimary,
    fontFamily: fonts.subheadline,
    fontSize: 16,
    minWidth: 100,
    textAlign: 'center',
  },
  counterMove: {
    color: colors.accent,
    fontFamily: fonts.ui,
    fontSize: 14,
    textAlign: 'center',
  },
  sectionSubTitle: {
    color: colors.textPrimary,
    fontFamily: fonts.subheadline,
    fontSize: 16,
    marginBottom: 8,
  },
  chipsRow: {
    paddingBottom: 4,
    gap: spacing.sm,
  },
  moveChip: {
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.full,
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignSelf: 'flex-start',
  },
  moveChipCurrent: {
    backgroundColor: colors.accent,
  },
  moveChipFlagged: {
    backgroundColor: colors.danger,
  },
  moveChipText: {
    color: colors.textSecondary,
    fontFamily: fonts.ui,
    fontSize: 13,
  },
  moveChipTextCurrent: {
    color: colors.bg,
  },
  moveChipTextFlagged: {
    color: colors.textPrimary,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.md,
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontFamily: fonts.headline,
    fontSize: 18,
    marginBottom: 12,
  },
  engineLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  engineLoadingText: {
    color: colors.textSecondary,
    fontFamily: fonts.body,
    fontSize: 13,
  },
  engineUnavailable: {
    color: colors.textSecondary,
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 20,
    marginBottom: spacing.md,
  },
  engineSummary: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    marginBottom: spacing.md,
    ...shadows.card,
  },
  engineStat: {
    flex: 1,
    alignItems: 'center',
  },
  engineStatValue: {
    color: colors.accent,
    fontFamily: fonts.headline,
    fontSize: 22,
    letterSpacing: 0.5,
    fontVariant: ['tabular-nums'],
  },
  engineStatLabel: {
    color: colors.textSecondary,
    fontFamily: fonts.body,
    fontSize: 11,
    marginTop: 2,
  },
  engineClean: {
    color: colors.success,
    fontFamily: fonts.body,
    fontSize: 14,
    marginBottom: spacing.md,
  },
  mistakeCard: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.sm,
    padding: spacing.md,
    marginBottom: spacing.sm,
    alignItems: 'flex-start',
  },
  enginePressed: {
    opacity: 0.75,
  },
  mistakeAccent: {
    width: 3,
    alignSelf: 'stretch',
    borderRadius: 2,
    marginRight: spacing.md,
  },
  mistakeText: {
    flex: 1,
    color: colors.textPrimary,
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 20,
  },
  engineMore: {
    color: colors.textSecondary,
    fontFamily: fonts.body,
    fontSize: 12,
    marginBottom: spacing.sm,
  },
  engineCaption: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 11,
    lineHeight: 16,
    marginBottom: spacing.md,
  },
  insightRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  insightBullet: {
    color: colors.accent,
    marginRight: 8,
    fontSize: 16,
    lineHeight: 22,
  },
  insightText: {
    flex: 1,
    color: colors.textSecondary,
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 22,
  },
  noPatterns: {
    color: colors.textSecondary,
    fontFamily: fonts.body,
    marginBottom: spacing.md,
  },
  flagCard: {
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.md,
    marginBottom: 8,
    flexDirection: 'row',
    overflow: 'hidden',
  },
  flagAccent: {
    width: 3,
  },
  flagBody: {
    padding: 14,
    flex: 1,
  },
  flagLabel: {
    color: colors.textPrimary,
    fontFamily: fonts.subheadline,
    fontSize: 15,
    marginBottom: 2,
  },
  flagMove: {
    color: colors.textSecondary,
    fontFamily: fonts.body,
    fontSize: 12,
  },
  recommendCard: {
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.md,
    padding: spacing.md,
    borderLeftWidth: 3,
    borderLeftColor: colors.accent,
    marginTop: spacing.sm,
    ...shadows.accent,
  },
  recommendLabel: {
    color: colors.textMuted,
    fontFamily: fonts.ui,
    fontSize: 10,
    letterSpacing: 2,
    marginBottom: 8,
  },
  recommendText: {
    color: colors.textPrimary,
    fontFamily: fonts.headline,
    fontSize: 16,
    lineHeight: 24,
  },
  taggingSection: {
    marginTop: spacing.lg,
    paddingBottom: spacing.lg,
  },
  taggingTitle: {
    color: colors.textPrimary,
    fontFamily: fonts.headline,
    fontSize: 20,
    marginBottom: 6,
  },
  taggingSubtitle: {
    color: colors.textSecondary,
    fontFamily: fonts.body,
    fontSize: 13,
    marginBottom: 16,
  },
  tagGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 16,
  },
  tagPill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.full,
    marginRight: 8,
    marginBottom: 8,
  },
  tagPillInactive: {
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tagPillActive: {
    backgroundColor: colors.accent,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  tagPillText: {
    fontFamily: fonts.ui,
    fontSize: 13,
    color: colors.textSecondary,
  },
  tagPillTextActive: {
    color: colors.bg,
  },
  reflectionLabel: {
    color: colors.textSecondary,
    fontFamily: fonts.ui,
    fontSize: 12,
    marginBottom: 6,
  },
  reflectionRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  reflectionInput: {
    flex: 1,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    padding: 12,
    color: colors.textPrimary,
    fontFamily: fonts.body,
    fontSize: 14,
    minHeight: 80,
  },
  reflectionMicButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  reflectionMicButtonRecording: {
    backgroundColor: colors.danger,
    borderColor: colors.danger,
  },
  reflectionMicButtonDone: {
    backgroundColor: colors.success,
    borderColor: colors.success,
  },
  reflectionMicButtonError: {
    backgroundColor: colors.danger,
    borderColor: colors.danger,
  },
  recordingStatusText: {
    fontSize: 12,
    fontFamily: fonts.body,
    marginBottom: 12,
  },
  summaryPillsWrap: {
    marginTop: 4,
    marginBottom: 12,
  },
  summaryPillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  summaryPill: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.full,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginRight: 8,
    marginBottom: 6,
  },
  summaryPillSelected: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  summaryPillText: {
    color: colors.textSecondary,
    fontFamily: fonts.ui,
    fontSize: 12,
  },
  summaryPillTextSelected: {
    color: colors.bg,
  },
  summarizingInlineText: {
    color: colors.accent,
    fontFamily: fonts.body,
    fontSize: 12,
    marginTop: 4,
  },
  summaryErrorText: {
    color: colors.danger,
    fontFamily: fonts.body,
    fontSize: 12,
    marginBottom: 8,
  },
  saveSuccessText: {
    color: colors.success,
    fontFamily: fonts.body,
    fontSize: 13,
    marginBottom: 8,
    textAlign: 'center',
  },
  saveTagsButton: {
    backgroundColor: colors.accent,
    borderRadius: radius.sm,
    padding: 16,
    alignItems: 'center',
  },
  saveTagsButtonDisabled: {
    opacity: 0.5,
  },
  saveTagsButtonText: {
    color: colors.bg,
    fontFamily: fonts.subheadline,
    fontSize: 15,
  },
});
