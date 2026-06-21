import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';

import { GameEntry, getGames, getUsername, saveGames } from '@/lib/storage';
import { fetchChessComGames, fetchLichessGames } from '@/lib/api';
import { colors, fonts, radius, shadows, spacing } from '@/lib/theme';
import { useTabNavigation } from '@/lib/tab-context';

const HISTORY_TAB_INDEX = 2;

type FilterType = 'All' | 'Chess.com' | 'Lichess';

// Returns a display date for a game entry.
function formatGameDate(date: string): string {
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) {
    return date;
  }
  return parsed.toLocaleDateString();
}

// Visual + accessible metadata for each game result.
const RESULT_META: Record<
  GameEntry['result'],
  { letter: string; word: string; color: string }
> = {
  win: { letter: 'W', word: 'Win', color: colors.success },
  loss: { letter: 'L', word: 'Loss', color: colors.danger },
  draw: { letter: 'D', word: 'Draw', color: colors.textSecondary },
};

// Renders one game row card.
function GameCard({ game }: { game: GameEntry }): React.JSX.Element {
  const result = RESULT_META[game.result];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${result.word} versus ${game.opponent}, rating ${game.myRating}, ${game.timeControl}`}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      onPress={() =>
        router.push({
          pathname: '/game-review',
          params: {
            gameData: JSON.stringify({
              ...game,
              pgn: game.pgn,
            }),
            platform: game.platform,
          },
        })
      }
    >
      <View style={[styles.resultBadge, { backgroundColor: result.color }]}>
        <Text style={styles.resultBadgeText}>{result.letter}</Text>
      </View>
      <View style={styles.centerInfo}>
        <View style={styles.opponentRow}>
          <Text style={styles.opponentText} numberOfLines={1}>
            {game.opponent}
          </Text>
          {game.reviewed ? <View style={styles.reviewedDot} /> : null}
        </View>
        <Text style={styles.metaText}>{formatGameDate(game.date)}</Text>
      </View>
      <View style={styles.rightInfo}>
        <Text style={styles.ratingText}>{game.myRating}</Text>
        <Text style={styles.metaText}>{game.timeControl}</Text>
      </View>
      <Text style={styles.rowArrow}>→</Text>
    </Pressable>
  );
}

// Renders the game history screen.
export default function HistoryScreen(): React.JSX.Element {
  const { activeTabIndex } = useTabNavigation();
  const [games, setGames] = useState<GameEntry[]>([]);
  const [selectedFilter, setSelectedFilter] = useState<FilterType>('All');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [refreshing, setRefreshing] = useState(false);

  // Loads game history from storage.
  const loadGames = useCallback(async () => {
    setIsLoading(true);
    const history = await getGames();
    setGames(history);
    setIsLoading(false);
  }, []);

  // Reload whenever History tab becomes active (picks up reviewed dots etc).
  useEffect(() => {
    if (activeTabIndex === HISTORY_TAB_INDEX) {
      loadGames();
    }
  }, [activeTabIndex, loadGames]);

  // Syncs latest games from connected platforms then reloads.
  // Merges fetched games with existing ones so no history is lost.
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const [chesscomUser, lichessUser] = await Promise.all([
        getUsername('Chess.com'),
        getUsername('Lichess'),
      ]);
      const existing = await getGames();
      let merged = [...existing];

      if (chesscomUser) {
        const fetched = await fetchChessComGames(chesscomUser);
        if (fetched.length > 0) {
          const existingIds = new Set(merged.map((g) => g.id));
          const newGames = fetched.filter((g) => !existingIds.has(g.id));
          merged = [...merged, ...newGames];
        }
      }
      if (lichessUser) {
        const fetched = await fetchLichessGames(lichessUser);
        if (fetched.length > 0) {
          const existingIds = new Set(merged.map((g) => g.id));
          const newGames = fetched.filter((g) => !existingIds.has(g.id));
          merged = [...merged, ...newGames];
        }
      }
      await saveGames(merged);
      const history = await getGames();
      setGames(history);
    } catch {
      // fail silently
    } finally {
      setRefreshing(false);
    }
  }, []);

  // Initial load on mount.
  useEffect(() => {
    loadGames();
  }, [loadGames]);

  const filteredGames = useMemo(() => {
    if (selectedFilter === 'All') {
      return games;
    }
    return games.filter((game) => game.platform === selectedFilter);
  }, [games, selectedFilter]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Game History</Text>
      <Text style={styles.subtitle}>Learn from every move</Text>

      <View style={styles.filterRow}>
        {(['All', 'Chess.com', 'Lichess'] as FilterType[]).map((filter) => (
          <Pressable
            key={filter}
            onPress={() => setSelectedFilter(filter)}
            accessibilityRole="button"
            accessibilityState={{ selected: selectedFilter === filter }}
            style={({ pressed }) => [
              styles.filterButton,
              selectedFilter === filter ? styles.filterButtonActive : null,
              pressed && styles.filterButtonPressed,
            ]}
          >
            <Text
              style={[
                styles.filterText,
                selectedFilter === filter ? styles.filterTextActive : null,
              ]}
            >
              {filter}
            </Text>
          </Pressable>
        ))}
      </View>

      {isLoading ? <Text style={styles.loadingText}>Loading...</Text> : null}

      <FlatList
        data={filteredGames}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <GameCard game={item} />}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <Text style={styles.syncHint}>Pull down to sync latest games</Text>
        }
        ListEmptyComponent={
          !isLoading ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>
                No games yet. Connect your account in the Tracker tab.
              </Text>
            </View>
          ) : null
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#C9B785"
            colors={['#C9B785']}
            progressBackgroundColor="#1E1E1E"
          />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xxl,
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
    marginBottom: 16,
  },
  filterRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  filterButton: {
    flex: 1,
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterButtonActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  filterButtonPressed: {
    opacity: 0.75,
  },
  filterText: {
    color: colors.textPrimary,
    fontSize: 12,
    fontFamily: fonts.ui,
    letterSpacing: 0,
  },
  filterTextActive: {
    color: colors.bg,
  },
  loadingText: {
    color: colors.textSecondary,
    fontSize: 14,
    marginBottom: 10,
    fontFamily: fonts.body,
    letterSpacing: 0,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    color: colors.textSecondary,
    fontSize: 16,
    textAlign: 'center',
    fontFamily: fonts.body,
    letterSpacing: 0,
  },
  listContent: {
    paddingBottom: 16,
  },
  syncHint: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 11,
    textAlign: 'center',
    marginBottom: 10,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    ...shadows.card,
  },
  cardPressed: {
    opacity: 0.75,
  },
  resultBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    marginRight: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultBadgeText: {
    color: colors.bg,
    fontSize: 13,
    fontFamily: fonts.headline,
  },
  centerInfo: {
    flex: 1,
  },
  opponentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  reviewedDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.success,
  },
  rightInfo: {
    alignItems: 'flex-end',
    marginRight: 10,
  },
  rowArrow: {
    color: colors.textMuted,
    fontSize: 16,
    fontFamily: fonts.ui,
  },
  opponentText: {
    color: colors.textPrimary,
    fontSize: 15,
    marginBottom: 4,
    fontFamily: fonts.subheadline,
    letterSpacing: 0.5,
  },
  ratingText: {
    color: colors.accent,
    fontSize: 16,
    marginBottom: 4,
    fontFamily: fonts.headline,
    letterSpacing: 0.5,
    fontVariant: ['tabular-nums'],
  },
  metaText: {
    color: colors.textSecondary,
    fontSize: 11,
    fontFamily: fonts.body,
    letterSpacing: 0,
  },
});
