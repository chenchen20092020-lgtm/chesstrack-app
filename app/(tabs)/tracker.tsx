import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Dimensions,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { LineChart } from 'react-native-chart-kit';
import { colors, fonts, radius, shadows, spacing } from '@/lib/theme';

import {
  getGames,
  getRatings,
  getUsername,
  PlatformType,
  RatingEntry,
  saveGames,
  saveRating,
  saveUsername,
} from '@/lib/storage';
import {
  fetchChessComGames,
  fetchChessComRating,
  fetchLichessGames,
  fetchLichessRating,
} from '@/lib/api';

// Creates a unique id for each rating entry.
function createEntryId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// Returns chart labels from entry dates.
function buildChartLabels(entries: RatingEntry[]): string[] {
  return entries.map((entry) => {
    const date = new Date(entry.date);
    return `${date.getMonth() + 1}/${date.getDate()}`;
  });
}

// Returns chart rating values from entries.
function buildChartValues(entries: RatingEntry[]): number[] {
  return entries.map((entry) => entry.rating);
}

// Returns rating fetcher for a selected platform.
function getRatingFetcher(platform: PlatformType): (username: string) => Promise<number | null> {
  if (platform === 'Chess.com') {
    return fetchChessComRating;
  }
  return fetchLichessRating;
}

// Returns games fetcher for a selected platform.
function getGamesFetcher(platform: PlatformType): (username: string) => Promise<any[]> {
  if (platform === 'Chess.com') {
    return fetchChessComGames;
  }
  return fetchLichessGames;
}

// Renders the rating tracker screen.
export default function TrackerScreen(): React.JSX.Element {
  const [usernameInput, setUsernameInput] = useState<string>('');
  const [connectPlatform, setConnectPlatform] = useState<PlatformType>('Chess.com');
  const [ratingInput, setRatingInput] = useState<string>('');
  const [manualRatingError, setManualRatingError] = useState<string>('');
  const [ratings, setRatings] = useState<RatingEntry[]>([]);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isConnecting, setIsConnecting] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [statusType, setStatusType] = useState<'success' | 'error' | 'info' | null>(null);
  const [connectedUsername, setConnectedUsername] = useState<string | null>(null);
  const [celebrationMessage, setCelebrationMessage] = useState<string>('');
  const [celebrationColor, setCelebrationColor] = useState<string>(colors.textSecondary);

  // Loads all ratings from storage.
  const loadRatings = useCallback(async () => {
    const history = await getRatings();
    setRatings(history);
  }, []);

  // Loads the connected username for the currently selected connection platform.
  const loadConnectedUsername = useCallback(async () => {
    const storedUsername = await getUsername(connectPlatform);
    setConnectedUsername(storedUsername);
    setUsernameInput(storedUsername ?? '');
  }, [connectPlatform]);

  // Merges newly fetched games with existing storage — never removes old games.
  const syncGamesForPlatform = useCallback(
    async (platform: PlatformType, username: string) => {
      const fetchGames = getGamesFetcher(platform);
      const fetchedGames = await fetchGames(username);
      if (fetchedGames.length === 0) return;
      const existingGames = await getGames();
      const existingIds = new Set(existingGames.map((g) => g.id));
      const newGames = fetchedGames.filter((g) => !existingIds.has(g.id));
      if (newGames.length === 0) return;
      await saveGames([...existingGames, ...newGames]);
    },
    []
  );

  useEffect(() => {
    loadRatings();
    loadConnectedUsername();
  }, [loadConnectedUsername, loadRatings]);

  // Connects an account and performs an immediate rating and games sync.
  const handleConnect = useCallback(async () => {
    const username = usernameInput.trim();
    if (!username) {
      setStatusType('error');
      setStatusMessage('Username not found. Check spelling.');
      return;
    }

    setIsConnecting(true);
    setStatusType('info');
    setStatusMessage('Connecting...');
    try {
      const fetchRating = getRatingFetcher(connectPlatform);
      const rating = await fetchRating(username);

      if (rating === null) {
        setStatusType('error');
        setStatusMessage('Username not found. Check spelling.');
        return;
      }

      await saveUsername(connectPlatform, username);
      await saveRating({
        id: createEntryId(),
        date: new Date().toISOString(),
        rating,
        platform: connectPlatform,
      });
      await syncGamesForPlatform(connectPlatform, username);
      setConnectedUsername(username);
      await loadRatings();
      setStatusType('success');
      setStatusMessage(`Connected! Rating synced: ${rating}`);
    } catch {
      setStatusType('error');
      setStatusMessage('Username not found. Check spelling.');
    } finally {
      setIsConnecting(false);
    }
  }, [connectPlatform, loadRatings, syncGamesForPlatform, usernameInput]);

  // Fetches the latest rating and games for the connected account.
  const handleSyncNow = useCallback(async () => {
    const username = connectedUsername?.trim() ?? '';
    if (!username) {
      return;
    }

    setIsConnecting(true);
    setStatusType('info');
    setStatusMessage('Connecting...');
    try {
      const fetchRating = getRatingFetcher(connectPlatform);
      const rating = await fetchRating(username);
      if (rating === null) {
        setStatusType('error');
        setStatusMessage('Username not found. Check spelling.');
        return;
      }

      await saveRating({
        id: createEntryId(),
        date: new Date().toISOString(),
        rating,
        platform: connectPlatform,
      });
      await syncGamesForPlatform(connectPlatform, username);
      await loadRatings();
      setStatusType('success');
      setStatusMessage('Synced!');
      setTimeout(() => {
        setStatusType(null);
        setStatusMessage('');
      }, 2000);
    } catch {
      setStatusType('error');
      setStatusMessage('Username not found. Check spelling.');
    } finally {
      setIsConnecting(false);
    }
  }, [connectPlatform, connectedUsername, loadRatings, syncGamesForPlatform]);

  // Validates manual rating input and returns an error message when invalid.
  const validateManualRatingInput = useCallback((value: string): string => {
    const trimmed = value.trim();
    if (!trimmed) {
      return 'Please enter a rating';
    }

    if (trimmed.includes('.')) {
      return 'Rating must be a whole number';
    }

    const parsedRating = Number(trimmed);
    if (!Number.isFinite(parsedRating) || !Number.isInteger(parsedRating)) {
      return 'Rating must be a whole number';
    }

    if (parsedRating < 100) {
      return 'Rating must be at least 100';
    }

    if (parsedRating > 3000) {
      return 'Rating cannot exceed 3000';
    }

    return '';
  }, []);

  // Saves the current rating input to storage.
  const handleSave = useCallback(async () => {
    const validationError = validateManualRatingInput(ratingInput);
    if (validationError) {
      setManualRatingError(validationError);
      return;
    }
    const parsedRating = Number(ratingInput.trim());
    const previousRating = ratings.length > 0 ? ratings[ratings.length - 1].rating : null;

    setIsSaving(true);
    await saveRating({
      id: createEntryId(),
      date: new Date().toISOString(),
      rating: Math.round(parsedRating),
      platform: 'manual' as PlatformType,
    });
    setRatingInput('');
    setManualRatingError('');
    await loadRatings();
    setIsSaving(false);

    const nextRating = Math.round(parsedRating);
    if (previousRating === null) {
      setCelebrationMessage('First entry saved. Your journey starts now.');
      setCelebrationColor(colors.accent);
    } else {
      const delta = nextRating - previousRating;
      if (delta > 0) {
        setCelebrationMessage(`↑ Up ${delta} points. Keep it up.`);
        setCelebrationColor(colors.success);
      } else if (delta < 0) {
        setCelebrationMessage(`↓ Down ${Math.abs(delta)} points. Stay focused.`);
        setCelebrationColor(colors.textSecondary);
      } else {
        setCelebrationMessage('Saved. Keep building consistency.');
        setCelebrationColor(colors.textSecondary);
      }
    }
    setTimeout(() => {
      setCelebrationMessage('');
    }, 2000);
  }, [loadRatings, ratingInput, ratings, validateManualRatingInput]);

  const chartLabels = useMemo(() => buildChartLabels(ratings), [ratings]);
  const chartValues = useMemo(() => buildChartValues(ratings), [ratings]);
  const peakRating = useMemo(
    () => (ratings.length > 0 ? Math.max(...chartValues) : null),
    [chartValues, ratings.length]
  );
  const currentRating = useMemo(
    () => (ratings.length > 0 ? ratings[ratings.length - 1].rating : null),
    [ratings]
  );

  const statValues = useMemo(() => {
    const peak = peakRating ?? 0;
    const current = currentRating ?? 0;
    const total = ratings.length;
    return { peak, current, total };
  }, [currentRating, peakRating, ratings.length]);

  const dominantStat = useMemo(() => {
    const entries = [
      { key: 'peak', value: statValues.peak },
      { key: 'current', value: statValues.current },
      { key: 'total', value: statValues.total },
    ];
    entries.sort((a, b) => b.value - a.value);
    return entries[0]?.key ?? 'peak';
  }, [statValues]);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.title}>Rating Tracker</Text>
      <Text style={styles.subtitle}>Every point tells a story</Text>

      {celebrationMessage ? (
        <Text style={[styles.celebrationText, { color: celebrationColor }]}>
          {celebrationMessage}
        </Text>
      ) : null}

      <Text style={styles.sectionTitle}>Connect Account</Text>
      <View style={styles.connectRow}>
        <View style={styles.toggleRow}>
          <Pressable
            onPress={() => setConnectPlatform('Chess.com')}
            accessibilityRole="button"
            accessibilityState={{ selected: connectPlatform === 'Chess.com' }}
            style={({ pressed }) => [
              styles.toggleButton,
              connectPlatform === 'Chess.com' ? styles.toggleButtonActive : null,
              pressed && styles.pressed,
            ]}
          >
            <Text
              style={[
                styles.toggleText,
                connectPlatform === 'Chess.com' ? styles.toggleTextActive : null,
              ]}
            >
              Chess.com
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setConnectPlatform('Lichess')}
            accessibilityRole="button"
            accessibilityState={{ selected: connectPlatform === 'Lichess' }}
            style={({ pressed }) => [
              styles.toggleButton,
              connectPlatform === 'Lichess' ? styles.toggleButtonActive : null,
              pressed && styles.pressed,
            ]}
          >
            <Text
              style={[
                styles.toggleText,
                connectPlatform === 'Lichess' ? styles.toggleTextActive : null,
              ]}
            >
              Lichess
            </Text>
          </Pressable>
        </View>
        <View style={styles.inputRow}>
          <TextInput
            value={usernameInput}
            onChangeText={setUsernameInput}
            placeholder="Username"
            placeholderTextColor={colors.textSecondary}
            autoCapitalize="none"
            style={[styles.input, styles.inputFlex]}
          />
          <Pressable
            onPress={connectedUsername ? handleSyncNow : handleConnect}
            disabled={isConnecting}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.inlineButton,
              (pressed || isConnecting) && styles.pressed,
            ]}
          >
            <Text style={styles.inlineButtonText}>
              {isConnecting ? '...' : connectedUsername ? 'Sync' : 'Connect'}
            </Text>
          </Pressable>
        </View>
      </View>

      {statusMessage ? (
        <Text
          style={[
            styles.statusMessage,
            statusType === 'error'
              ? styles.statusError
              : statusType === 'success'
                ? styles.statusSuccess
                : styles.statusInfo,
          ]}
        >
          {statusMessage}
        </Text>
      ) : null}

      <Text style={styles.sectionTitle}>Manual Entry</Text>
      <View style={styles.inputRow}>
        <TextInput
          value={ratingInput}
          onChangeText={(text) => {
            setRatingInput(text);
            if (manualRatingError) {
              setManualRatingError('');
            }
          }}
          placeholder="Enter rating"
          placeholderTextColor={colors.textSecondary}
          keyboardType="numeric"
          style={[styles.input, styles.inputFlex]}
        />
        <Pressable
          onPress={handleSave}
          disabled={isSaving}
          accessibilityRole="button"
          style={({ pressed }) => [styles.inlineButton, (pressed || isSaving) && styles.pressed]}
        >
          <Text style={styles.inlineButtonText}>{isSaving ? '...' : 'Save'}</Text>
        </Pressable>
      </View>
      {manualRatingError ? (
        <Text style={styles.manualErrorText}>{manualRatingError}</Text>
      ) : null}

      <View style={styles.chartCard}>
        {ratings.length > 0 ? (
          <LineChart
            data={{
              labels: chartLabels,
              datasets: [{ data: chartValues }],
            }}
            width={Dimensions.get('window').width - 72}
            height={220}
            yAxisInterval={1}
            chartConfig={{
              backgroundColor: colors.surface,
              backgroundGradientFrom: colors.surface,
              backgroundGradientTo: colors.surface,
              decimalPlaces: 0,
              color: () => colors.accent,
              labelColor: () => colors.textSecondary,
              propsForDots: {
                r: '3',
                strokeWidth: '1',
                stroke: colors.accent,
              },
            }}
            bezier
            style={styles.chart}
          />
        ) : (
          <Text style={styles.emptyChartText}>Add entries to see your rating chart</Text>
        )}
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Peak Rating</Text>
          <Text
            style={[
              styles.statValue,
              dominantStat === 'peak' ? styles.statValueDominant : styles.statValueSecondary,
            ]}
          >
            {peakRating ?? '-'}
          </Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Current Rating</Text>
          <Text
            style={[
              styles.statValue,
              dominantStat === 'current' ? styles.statValueDominant : styles.statValueSecondary,
            ]}
          >
            {currentRating ?? '-'}
          </Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Total Entries</Text>
          <Text
            style={[
              styles.statValue,
              dominantStat === 'total' ? styles.statValueDominant : styles.statValueSecondary,
            ]}
          >
            {ratings.length}
          </Text>
        </View>
      </View>
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
    paddingBottom: spacing.lg,
  },
  title: {
    color: colors.textPrimary,
    fontSize: 28,
    marginBottom: 6,
    fontFamily: fonts.headline,
    letterSpacing: 0.5,
  },
  subtitle: {
    color: colors.textSecondary,
    fontFamily: fonts.body,
    fontSize: 13,
    marginBottom: 20,
  },
  celebrationText: {
    fontFamily: fonts.body,
    letterSpacing: 0,
    marginBottom: spacing.md,
    fontSize: 12,
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontSize: 14,
    marginBottom: 8,
    fontFamily: fonts.subheadline,
    letterSpacing: 0.5,
  },
  connectRow: {
    marginBottom: 10,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  input: {
    height: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceRaised,
    color: colors.textPrimary,
    paddingHorizontal: 12,
    fontFamily: fonts.ui,
    letterSpacing: 0,
    fontSize: 12,
  },
  inputFlex: {
    flex: 1,
  },
  manualErrorText: {
    color: colors.danger,
    fontSize: 11,
    marginTop: -4,
    marginBottom: 6,
    fontFamily: fonts.body,
    letterSpacing: 0,
  },
  toggleRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  toggleButton: {
    flex: 1,
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 8,
    alignItems: 'center',
  },
  toggleButtonActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  toggleText: {
    color: colors.textPrimary,
    fontSize: 12,
    fontFamily: fonts.ui,
    letterSpacing: 0,
  },
  toggleTextActive: {
    color: colors.bg,
  },
  inlineButton: {
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    minHeight: 44,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.75,
  },
  inlineButtonText: {
    color: colors.bg,
    fontSize: 13,
    fontFamily: fonts.subheadline,
    letterSpacing: 0.5,
  },
  statusMessage: {
    fontSize: 11,
    marginBottom: 10,
    fontFamily: fonts.body,
    letterSpacing: 0,
  },
  statusError: {
    color: colors.danger,
  },
  statusSuccess: {
    color: colors.accent,
  },
  statusInfo: {
    color: colors.textSecondary,
  },
  chartCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: 14,
    paddingHorizontal: 8,
    alignItems: 'center',
    marginBottom: 14,
    ...shadows.card,
  },
  chart: {
    borderRadius: radius.md,
  },
  emptyChartText: {
    color: colors.textSecondary,
    fontSize: 14,
    paddingVertical: 40,
    fontFamily: fonts.body,
    letterSpacing: 0,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: 12,
    paddingHorizontal: 10,
    alignItems: 'center',
    ...shadows.card,
  },
  statLabel: {
    color: colors.textSecondary,
    fontSize: 11,
    marginBottom: 4,
    fontFamily: fonts.body,
    letterSpacing: 0,
  },
  statValue: {
    fontSize: 18,
    fontFamily: fonts.headline,
    letterSpacing: 0.5,
    fontVariant: ['tabular-nums'],
  },
  statValueDominant: {
    color: colors.accent,
    fontSize: 22,
  },
  statValueSecondary: {
    color: colors.textSecondary,
  },
});
