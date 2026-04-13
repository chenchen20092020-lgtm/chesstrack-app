import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { getGames, getJournalEntries, getRatings, getUsername, GameEntry, RatingEntry } from '@/lib/storage';
import { colors, fonts, radius, shadows, spacing } from '@/lib/theme';

type SummaryState = {
  currentRating: number | null;
  ratingChangeWeek: number;
  totalGames: number;
};

type WeeklyState = {
  sessions: number;
  bestRating: number | null;
  change: number;
};

type GoalState = {
  goal: number | null;
  startRating: number | null;
};

// Calculates summary stats from the rating history.
function buildSummary(entries: RatingEntry[]): SummaryState {
  if (entries.length === 0) {
    return {
      currentRating: null,
      ratingChangeWeek: 0,
      totalGames: 0,
    };
  }

  const currentRating = entries[entries.length - 1].rating;
  const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const entriesThisWeek = entries.filter(
    (entry) => new Date(entry.date).getTime() >= oneWeekAgo
  );

  const firstThisWeekRating =
    entriesThisWeek.length > 0 ? entriesThisWeek[0].rating : currentRating;

  return {
    currentRating,
    ratingChangeWeek: currentRating - firstThisWeekRating,
    totalGames: entries.length,
  };
}

// Formats the current date as an uppercase DMMono header string.
function formatHeaderDate(now: Date): string {
  const days = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
  const months = [
    'JANUARY',
    'FEBRUARY',
    'MARCH',
    'APRIL',
    'MAY',
    'JUNE',
    'JULY',
    'AUGUST',
    'SEPTEMBER',
    'OCTOBER',
    'NOVEMBER',
    'DECEMBER',
  ];

  return `${days[now.getDay()]} · ${months[now.getMonth()]} ${now.getFullYear()}`;
}

// Formats the weekly rating delta with a sign.
function formatWeeklyChange(value: number): string {
  if (value > 0) {
    return `+${value}`;
  }
  return `${value}`;
}

// Calculates weekly stats from rating history.
function buildWeekly(entries: RatingEntry[]): WeeklyState {
  const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const thisWeek = entries.filter((e) => new Date(e.date).getTime() >= oneWeekAgo);
  const sessions = thisWeek.length;
  const bestRating = sessions > 0 ? Math.max(...thisWeek.map((e) => e.rating)) : null;

  const sorted = [...entries].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );
  const baseline = sorted.find((e) => new Date(e.date).getTime() >= oneWeekAgo);
  const current = sorted.length > 0 ? sorted[sorted.length - 1].rating : 0;
  const change = baseline ? current - baseline.rating : 0;

  return { sessions, bestRating, change };
}

// Returns a color for weekly change value.
function getChangeColor(change: number): string {
  if (change > 0) return colors.success;
  if (change < 0) return colors.danger;
  return colors.textSecondary;
}

// Formats weekly change with sign.
function formatSigned(change: number): string {
  if (change > 0) return `+${change}`;
  return `${change}`;
}

// Calculates a consecutive-day streak from rating entries.
function getStreakDays(entries: RatingEntry[]): number {
  if (entries.length === 0) return 0;

  const dayKey = (iso: string) => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(
      2,
      '0'
    )}`;
  };

  const daysWithEntries = new Set(entries.map((e) => dayKey(e.date)).filter(Boolean));
  let streak = 0;
  const cursor = new Date();
  for (;;) {
    const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(
      cursor.getDate()
    ).padStart(2, '0')}`;
    if (!daysWithEntries.has(key)) break;
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

// Returns a motivational streak message and color.
function getStreakMessage(streak: number): { text: string; color: string } {
  if (streak === 0) return { text: 'Start your streak today', color: colors.textSecondary };
  if (streak <= 2)
    return { text: 'Good start. Come back tomorrow to build momentum.', color: colors.textSecondary };
  if (streak <= 6)
    return { text: "Don't break it now. You're building a habit.", color: colors.warning };
  return { text: 'Elite consistency. Protect this streak.', color: colors.accent };
}

// Returns the first applicable small-wins banner copy.
function getSmallWinText(entries: RatingEntry[], weekly: WeeklyState): string | null {
  if (weekly.change > 0) {
    return `↑ ${formatSigned(weekly.change)} points this week`;
  }
  if (entries.length > 0) {
    const peak = Math.max(...entries.map((e) => e.rating));
    const current = entries[entries.length - 1].rating;
    if (current === peak && entries.length >= 2) {
      return `★ New personal best: ${peak}`;
    }
  }
  if (weekly.sessions >= 3) {
    return `⬡ ${weekly.sessions} sessions this week — great volume`;
  }
  return null;
}

// Chooses the next best action based on current user data.
function getNextStep(params: {
  username: string | null;
  gamesThisWeek: number;
  journalCount: number;
  goal: number | null;
}): { action: string; sub: string } {
  if (!params.username) {
    return { action: 'Connect your Chess.com account', sub: 'Unlock automatic rating sync' };
  }
  if (params.gamesThisWeek === 0) {
    return { action: "Log today's session", sub: 'Keep your streak alive' };
  }
  if (params.journalCount === 0) {
    return { action: 'Reflect on your last game', sub: 'Top players review every game' };
  }
  if (!params.goal) {
    return { action: 'Set your rating goal', sub: 'Give your training direction' };
  }
  return { action: 'Analyze your last game', sub: 'Find patterns in your mistakes' };
}

// Generates a coaching tip from the most recent rating trend.
function getCoachingTip(entries: RatingEntry[]): string {
  if (entries.length < 3) {
    return 'Track at least 3 sessions to unlock personalized coaching tips.';
  }

  const latestFive = entries.slice(-5);
  const first = latestFive[0].rating;
  const last = latestFive[latestFive.length - 1].rating;
  const delta = last - first;

  if (delta >= 20) {
    return "Great progress! You're on a winning streak. Keep focusing on tactics puzzles daily.";
  }

  if (delta <= -20) {
    return 'Everyone has rough patches. Review your last 3 losses — look for recurring mistakes in the opening.';
  }

  return "You've plateaued. Try playing longer time controls to improve your calculation.";
}

// Renders the ChessTrack home screen.
export default function HomeScreen(): React.JSX.Element {
  const [summary, setSummary] = useState<SummaryState>({
    currentRating: null,
    ratingChangeWeek: 0,
    totalGames: 0,
  });
  const [coachingTip, setCoachingTip] = useState<string>(
    'Track at least 3 sessions to unlock personalized coaching tips.'
  );
  const [weekly, setWeekly] = useState<WeeklyState>({
    sessions: 0,
    bestRating: null,
    change: 0,
  });
  const [recentGames, setRecentGames] = useState<GameEntry[]>([]);
  const [username, setUsername] = useState<string | null>(null);
  const [goalState, setGoalState] = useState<GoalState>({ goal: null, startRating: null });
  const [streakDays, setStreakDays] = useState<number>(0);
  const [journalCount, setJournalCount] = useState<number>(0);
  const [gamesThisWeek, setGamesThisWeek] = useState<number>(0);
  const [goalModalOpen, setGoalModalOpen] = useState<boolean>(false);
  const [goalInput, setGoalInput] = useState<string>('');
  const [refreshing, setRefreshing] = useState(false);
  // Loads current summary values from AsyncStorage.
  const loadSummary = useCallback(async () => {
    const ratings = await getRatings();
    setSummary(buildSummary(ratings));
    setCoachingTip(getCoachingTip(ratings));
    setWeekly(buildWeekly(ratings));
    setStreakDays(getStreakDays(ratings));
    const games = await getGames();
    setRecentGames(games.slice(0, 10));

    const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    setGamesThisWeek(games.filter((g) => new Date(g.date).getTime() >= oneWeekAgo).length);

    try {
      const chesscom = await getUsername('Chess.com');
      const lichess = await getUsername('Lichess');
      setUsername(chesscom || lichess);
    } catch {
      setUsername(null);
    }

    try {
      const goalRaw = await AsyncStorage.getItem('rating_goal');
      const goal = goalRaw ? Number(goalRaw) : null;
      const startRating = ratings.length > 0 ? ratings[0].rating : null;
      setGoalState({
        goal: goal && Number.isFinite(goal) ? Math.round(goal) : null,
        startRating,
      });
    } catch {
      setGoalState({ goal: null, startRating: null });
    }

    try {
      const journals = await getJournalEntries();
      setJournalCount(journals.length);
    } catch {
      setJournalCount(0);
    }
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadSummary();
    } catch {
      // fail silently
    } finally {
      setRefreshing(false);
    }
  }, [loadSummary]);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  const currentRatingText = useMemo(() => {
    return summary.currentRating === null ? '-' : `${summary.currentRating}`;
  }, [summary.currentRating]);

  const weeklyChangeColor = useMemo(() => getChangeColor(weekly.change), [weekly.change]);

  const showRecentGames = recentGames.length > 0;

  const dateText = useMemo(() => formatHeaderDate(new Date()), []);
  const streakMessage = useMemo(() => getStreakMessage(streakDays), [streakDays]);
  const smallWin = useMemo(() => getSmallWinText([], weekly), [weekly]);
  const nextStep = useMemo(
    () =>
      getNextStep({
        username,
        gamesThisWeek,
        journalCount,
        goal: goalState.goal,
      }),
    [gamesThisWeek, goalState.goal, journalCount, username]
  );

  const goalProgress = useMemo(() => {
    if (!goalState.goal || !goalState.startRating || !summary.currentRating) return null;
    const denom = goalState.goal - goalState.startRating;
    if (denom === 0) return 100;
    const pct = ((summary.currentRating - goalState.startRating) / denom) * 100;
    return Math.max(0, Math.min(100, Math.round(pct)));
  }, [goalState.goal, goalState.startRating, summary.currentRating]);

  const goalMotivation = useMemo(() => {
    if (!goalState.goal || !summary.currentRating) return '';
    const remaining = Math.max(0, goalState.goal - summary.currentRating);
    if (remaining <= 50) return "You're so close. One good session could get you there.";
    if (remaining <= 100) return 'Keep the momentum going.';
    if (remaining <= 200) return 'Steady progress. Stay consistent.';
    return 'Long journey ahead. Trust the process.';
  }, [goalState.goal, summary.currentRating]);

  // Saves the rating goal from modal input.
  const saveGoal = useCallback(async () => {
    const parsed = Number(goalInput.trim());
    if (!Number.isFinite(parsed) || parsed <= 0) {
      Alert.alert('Invalid goal', 'Please enter a valid number.');
      return;
    }
    await AsyncStorage.setItem('rating_goal', `${Math.round(parsed)}`);
    setGoalModalOpen(false);
    setGoalInput('');
    loadSummary();
  }, [goalInput, loadSummary]);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor="#C9B785"
          colors={['#C9B785']}
          progressBackgroundColor="#1E1E1E"
        />
      }
    >
      <StatusBar style="light" backgroundColor={colors.bg} />
      <Text style={styles.syncHint}>Pull down to sync latest games</Text>

      {username ? (
        <View style={styles.personalHeader}>
          <Text style={styles.welcomeBack}>Welcome back,</Text>
          <Text style={styles.usernameText}>{username}</Text>
        </View>
      ) : (
        <Text style={styles.brandTitle}>ChessTrack</Text>
      )}
      <Text style={styles.dateText}>{dateText}</Text>

      <View style={[styles.goalCard, shadows.accent]}>
        <View style={styles.goalTopRow}>
          <Text style={styles.goalLabel}>RATING GOAL</Text>
        </View>
        {!goalState.goal ? (
          <View style={styles.goalEmptyRow}>
            <Text style={styles.goalEmptyText}>Set your rating goal</Text>
            <Pressable onPress={() => setGoalModalOpen(true)} style={styles.goalButton}>
              <Text style={styles.goalButtonText}>Set Goal</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <Text style={styles.goalNumbers}>
              <Text style={styles.goalCurrent}>{summary.currentRating ?? '-'}</Text>
              <Text style={styles.goalArrow}> → </Text>
              <Text style={styles.goalTarget}>{goalState.goal}</Text>
            </Text>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${goalProgress ?? 0}%` }]} />
            </View>
            <Text style={styles.progressPct}>{`${goalProgress ?? 0}% there`}</Text>
            <Text style={styles.goalMotivation}>{goalMotivation}</Text>
          </>
        )}
      </View>

      <View style={[styles.streakCard, streakDays > 0 ? styles.streakActiveBorder : null]}>
        <View style={styles.streakLeft}>
          <Text style={styles.streakNumber}>{streakDays}</Text>
          <Text style={styles.streakLabel}>day streak</Text>
        </View>
        <Text style={[styles.streakMessage, { color: streakMessage.color }]}>{streakMessage.text}</Text>
      </View>

      {smallWin ? (
        <View style={styles.smallWinsRow}>
          <View style={styles.smallWinsAccent} />
          <Text style={styles.smallWinsText}>{smallWin}</Text>
        </View>
      ) : null}

      <View style={styles.card}>
        <View style={styles.metricRow}>
          <Text style={styles.metricLabel}>Current Elo Rating</Text>
          <Text style={styles.metricValue}>{currentRatingText}</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.metricRow}>
          <Text style={styles.metricLabel}>Rating Change This Week</Text>
          <Text style={styles.metricValue}>
            {summary.currentRating === null ? '-' : formatWeeklyChange(summary.ratingChangeWeek)}
          </Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.metricRow}>
          <Text style={styles.metricLabel}>Total Games Logged</Text>
          <Text style={styles.metricValue}>{summary.totalGames}</Text>
        </View>
      </View>

      <View style={styles.nextStepCard}>
        <View style={styles.nextStepTopRow}>
          <Text style={styles.nextStepLabel}>YOUR NEXT MOVE</Text>
          <Text style={styles.nextStepArrow}>→</Text>
        </View>
        <Text style={styles.nextStepAction}>{nextStep.action}</Text>
        <Text style={styles.nextStepSub}>{nextStep.sub}</Text>
      </View>

      <View style={styles.weeklyCard}>
        <Text style={styles.weeklyTitle}>This Week</Text>
        <View style={styles.weeklyRow}>
          <View style={styles.weeklyStat}>
            <Text style={styles.weeklyLabel}>Sessions</Text>
            <Text style={styles.weeklyValue}>{weekly.sessions}</Text>
          </View>
          <View style={styles.weeklyStat}>
            <Text style={styles.weeklyLabel}>Best Rating</Text>
            <Text style={styles.weeklyValue}>{weekly.bestRating ?? '-'}</Text>
          </View>
          <View style={styles.weeklyStat}>
            <Text style={styles.weeklyLabel}>Change</Text>
            <Text style={[styles.weeklyValue, { color: weeklyChangeColor }]}>
              {formatSigned(weekly.change)}
            </Text>
          </View>
        </View>
      </View>

      {showRecentGames ? (
        <View style={styles.recentSection}>
          <Text style={styles.recentTitle}>Recent Games</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {recentGames.map((game) => {
              const indicatorColor =
                game.result === 'win'
                  ? colors.success
                  : game.result === 'loss'
                    ? colors.danger
                    : colors.textSecondary;
              const indicatorText =
                game.result === 'win' ? 'W' : game.result === 'loss' ? 'L' : 'D';

              return (
                <View key={game.id} style={styles.recentCard}>
                  <View style={[styles.resultCircle, { backgroundColor: indicatorColor }]}>
                    <Text style={styles.resultCircleText}>{indicatorText}</Text>
                  </View>
                  <Text numberOfLines={1} style={styles.recentOpponent}>
                    {game.opponent}
                  </Text>
                  <Text style={styles.recentRating}>{game.myRating}</Text>
                </View>
              );
            })}
          </ScrollView>
        </View>
      ) : null}

      <View style={styles.coachCard}>
        <Text style={styles.coachTitle}>Coach&apos;s Corner</Text>
        <Text style={styles.coachSubtitle}>Personalized trend insight</Text>
        <Text style={styles.coachTip}>{coachingTip}</Text>
      </View>

      <Modal visible={goalModalOpen} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Set rating goal</Text>
            <TextInput
              value={goalInput}
              onChangeText={setGoalInput}
              placeholder="e.g. 1500"
              placeholderTextColor={colors.textSecondary}
              keyboardType="numeric"
              style={styles.modalInput}
            />
            <View style={styles.modalActions}>
              <Pressable onPress={() => setGoalModalOpen(false)} style={styles.modalButton}>
                <Text style={styles.modalButtonText}>Cancel</Text>
              </Pressable>
              <Pressable onPress={saveGoal} style={[styles.modalButton, styles.modalButtonPrimary]}>
                <Text style={[styles.modalButtonText, styles.modalButtonPrimaryText]}>Save</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  contentContainer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xxl,
    paddingBottom: spacing.xl,
  },
  syncHint: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 11,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  personalHeader: {
    marginBottom: spacing.sm,
  },
  welcomeBack: {
    color: colors.textSecondary,
    fontSize: 14,
    fontFamily: fonts.body,
    letterSpacing: 0.3,
  },
  usernameText: {
    color: colors.textPrimary,
    fontSize: 30,
    fontFamily: fonts.headline,
    letterSpacing: 0.5,
    marginTop: spacing.xs,
  },
  brandTitle: {
    color: colors.accent,
    fontSize: 32,
    fontFamily: fonts.headline,
    letterSpacing: 0.5,
    marginBottom: spacing.xs,
  },
  dateText: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 11,
    letterSpacing: 1.5,
    marginBottom: spacing.lg,
  },
  card: {
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    ...shadows.card,
    marginBottom: spacing.lg,
  },
  metricRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 48,
  },
  metricLabel: {
    color: colors.textSecondary,
    fontSize: 11,
    fontFamily: fonts.body,
    letterSpacing: 0.5,
  },
  metricValue: {
    color: colors.textPrimary,
    fontSize: 24,
    fontWeight: '700',
    fontFamily: fonts.headline,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
  },
  coachCard: {
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.lg,
    borderLeftWidth: 3,
    borderLeftColor: colors.accent,
    ...shadows.card,
  },
  coachTitle: {
    color: colors.textPrimary,
    fontSize: 15,
    marginBottom: 4,
    fontFamily: fonts.subheadline,
    letterSpacing: 0.5,
  },
  coachSubtitle: {
    color: colors.textSecondary,
    fontSize: 12,
    marginBottom: 10,
    fontFamily: fonts.body,
    letterSpacing: 0,
  },
  coachTip: {
    color: colors.textSecondary,
    fontSize: 13,
    fontFamily: fonts.body,
    lineHeight: 20,
    letterSpacing: 0,
  },
  weeklyCard: {
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
    ...shadows.card,
  },
  weeklyTitle: {
    color: colors.textPrimary,
    fontSize: 16,
    marginBottom: 12,
    fontFamily: fonts.subheadline,
    letterSpacing: 0.5,
  },
  weeklyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  weeklyStat: {
    flex: 1,
    alignItems: 'center',
  },
  weeklyLabel: {
    color: colors.textSecondary,
    fontSize: 11,
    fontFamily: fonts.body,
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  weeklyValue: {
    color: colors.textPrimary,
    fontSize: 24,
    fontWeight: '700',
    fontFamily: fonts.headline,
  },
  recentSection: {
    marginBottom: spacing.lg,
  },
  recentTitle: {
    color: colors.textPrimary,
    fontSize: 16,
    marginBottom: 8,
    fontFamily: fonts.subheadline,
    letterSpacing: 0.5,
  },
  recentCard: {
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.sm,
    padding: spacing.sm + 4,
    marginRight: spacing.sm,
    width: 120,
    borderWidth: 1,
    borderColor: colors.border,
  },
  resultCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  resultCircleText: {
    color: colors.bg,
    fontSize: 12,
    fontWeight: '700',
  },
  recentOpponent: {
    color: colors.textSecondary,
    fontFamily: fonts.body,
    fontSize: 11,
    marginBottom: 8,
    letterSpacing: 0,
  },
  recentRating: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: '700',
    fontFamily: fonts.headline,
  },
  goalCard: {
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  goalTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  goalLabel: {
    color: colors.textMuted,
    fontFamily: fonts.ui,
    fontSize: 10,
    letterSpacing: 2,
  },
  goalEmptyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
  },
  goalEmptyText: {
    color: colors.textSecondary,
    fontFamily: fonts.body,
    letterSpacing: 1,
    flex: 1,
  },
  goalButton: {
    backgroundColor: colors.accent,
    borderRadius: radius.full,
    paddingVertical: spacing.xs + 2,
    paddingHorizontal: spacing.md,
  },
  goalButtonText: {
    color: colors.bg,
    fontFamily: fonts.subheadline,
    letterSpacing: 0.5,
    fontSize: 12,
  },
  goalNumbers: {
    fontFamily: fonts.headline,
    fontSize: 28,
    marginBottom: spacing.sm,
    letterSpacing: 0.5,
  },
  goalCurrent: {
    color: colors.textPrimary,
  },
  goalArrow: {
    color: colors.textMuted,
  },
  goalTarget: {
    color: colors.accent,
  },
  progressTrack: {
    height: 6,
    borderRadius: radius.full,
    backgroundColor: colors.border,
    overflow: 'hidden',
    marginBottom: spacing.sm,
  },
  progressFill: {
    height: 6,
    borderRadius: radius.full,
    backgroundColor: colors.accent,
  },
  progressPct: {
    color: colors.textSecondary,
    fontFamily: fonts.body,
    fontSize: 11,
    letterSpacing: 0.5,
    textAlign: 'right',
    marginBottom: spacing.sm,
  },
  goalMotivation: {
    color: colors.textSecondary,
    fontFamily: fonts.body,
    letterSpacing: 1,
    lineHeight: 18,
  },
  streakCard: {
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    ...shadows.card,
  },
  streakActiveBorder: {
    borderBottomWidth: 2,
    borderBottomColor: colors.accent,
  },
  streakLeft: {
    alignItems: 'flex-start',
  },
  streakNumber: {
    color: colors.accent,
    fontFamily: fonts.headline,
    fontSize: 48,
    letterSpacing: 0.5,
    lineHeight: 52,
  },
  streakLabel: {
    color: colors.textSecondary,
    fontFamily: fonts.body,
    fontSize: 12,
    letterSpacing: 0.5,
    marginTop: -2,
  },
  streakMessage: {
    flex: 1,
    textAlign: 'right',
    marginLeft: spacing.md,
    fontFamily: fonts.body,
    letterSpacing: 1,
    lineHeight: 18,
  },
  smallWinsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  smallWinsAccent: {
    width: 2,
    height: 18,
    backgroundColor: colors.accent,
    marginRight: spacing.sm,
    borderRadius: radius.full,
  },
  smallWinsText: {
    color: colors.accent,
    fontFamily: fonts.body,
    fontSize: 13,
    letterSpacing: 0,
  },
  nextStepCard: {
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
    ...shadows.card,
  },
  nextStepTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  nextStepLabel: {
    color: colors.textMuted,
    fontFamily: fonts.ui,
    fontSize: 10,
    letterSpacing: 2,
  },
  nextStepArrow: {
    color: colors.accent,
    fontFamily: fonts.subheadline,
    fontSize: 18,
    letterSpacing: 0.5,
  },
  nextStepAction: {
    color: colors.textPrimary,
    fontFamily: fonts.headline,
    fontSize: 17,
    letterSpacing: 0.5,
    marginBottom: spacing.xs,
  },
  nextStepSub: {
    color: colors.textSecondary,
    fontFamily: fonts.body,
    fontSize: 12,
    letterSpacing: 0,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  modalCard: {
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  modalTitle: {
    color: colors.textPrimary,
    fontFamily: fonts.subheadline,
    letterSpacing: 0.5,
    fontSize: 16,
    marginBottom: spacing.sm,
  },
  modalInput: {
    height: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    color: colors.textPrimary,
    paddingHorizontal: spacing.md,
    fontFamily: fonts.body,
    letterSpacing: 0,
    marginBottom: spacing.md,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
  },
  modalButton: {
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  modalButtonPrimary: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  modalButtonText: {
    color: colors.textPrimary,
    fontFamily: fonts.ui,
    letterSpacing: 0,
    fontSize: 13,
  },
  modalButtonPrimaryText: {
    color: colors.bg,
  },
});
