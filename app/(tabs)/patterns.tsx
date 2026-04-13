import React, { useCallback, useEffect, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { useTabNavigation } from '@/lib/tab-context';

const PATTERNS_TAB_INDEX = 4;

import { colors, fonts, radius, spacing } from '@/lib/theme';
import { GameTag, getGames, getTagSummary, TagSummary } from '@/lib/storage';

// Actionable coaching tip for each tag type.
const TAG_TIPS: Record<GameTag, string> = {
  'time-pressure':
    'Practice with a faster time control. Play 1+0 bullet to force faster decisions.',
  'opening-mistake':
    'Study your opening repertoire. Learn 10 moves deep for your main lines.',
  'endgame-mistake':
    'Practice K+P endgames daily. Most games at your level are decided in endgames.',
  'tactical-miss':
    'Solve 10 puzzles every day. Pattern recognition is built through repetition.',
  'overconfident':
    'Before every capture, ask: what can my opponent do after this?',
  'calculation-error':
    'Practice calculation puzzles. Visualize 3 moves ahead before deciding.',
  'positional-error':
    'Study pawn structures. Understanding pawns unlocks positional play.',
  'other':
    'Review your tagged games and look for a common thread in your mistakes.',
};

// Returns the ISO date string for the start of a week N weeks ago (Monday).
function weekStart(weeksAgo: number): Date {
  const now = new Date();
  const day = now.getDay(); // 0 = Sunday
  const diffToMonday = (day + 6) % 7;
  const monday = new Date(now);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(now.getDate() - diffToMonday - weeksAgo * 7);
  return monday;
}

// Returns the label string for a week offset.
function weekLabel(weeksAgo: number): string {
  if (weeksAgo === 0) return 'This week';
  if (weeksAgo === 1) return 'Last week';
  return `${weeksAgo} weeks ago`;
}

type WeekRow = { label: string; count: number };

// Renders the Patterns tab screen showing aggregated tag data.
// History tab is at index 2 in the TABS array defined in _layout.tsx.
const HISTORY_TAB_INDEX = 2;

export default function PatternsScreen(): React.JSX.Element {
  const { goToTab, activeTabIndex } = useTabNavigation();
  const [summary, setSummary] = useState<TagSummary | null>(null);
  const [weekRows, setWeekRows] = useState<WeekRow[]>([]);
  const [maxWeekCount, setMaxWeekCount] = useState<number>(1);

  // Loads tag summary and weekly breakdown from storage.
  const load = useCallback(async () => {
    const [ts, games] = await Promise.all([getTagSummary(), getGames()]);
    setSummary(ts);

    const taggedGames = games.filter((g) => g.reviewed);
    const rows: WeekRow[] = [];
    let max = 1;
    for (let w = 0; w < 4; w++) {
      const start = weekStart(w);
      const end = weekStart(w - 1);
      const count = taggedGames.filter((g) => {
        const d = new Date(g.date).getTime();
        return d >= start.getTime() && d < end.getTime();
      }).length;
      rows.push({ label: weekLabel(w), count });
      if (count > max) max = count;
    }
    setWeekRows(rows);
    setMaxWeekCount(max);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Reload whenever Patterns tab becomes active so new tags appear immediately.
  useEffect(() => {
    if (activeTabIndex === PATTERNS_TAB_INDEX) {
      load();
    }
  }, [activeTabIndex, load]);

  const noData = !summary || summary.totalTagged === 0;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.title}>Your Patterns</Text>
      <Text style={styles.subtitle}>Spot the habits, break the cycle</Text>

      {noData ? (
        // ── Empty state ──────────────────────────────────────────────────────
        <View style={styles.emptyCard}>
          <Text style={styles.emptyHeading}>No patterns yet</Text>
          <Text style={styles.emptyBody}>
            Review a game and tag what went wrong. After a few games, your
            recurring mistakes will appear here.
          </Text>
          <Pressable
            style={styles.emptyButton}
            onPress={() => goToTab(HISTORY_TAB_INDEX)}
          >
            <Text style={styles.emptyButtonText}>Review Your First Game</Text>
          </Pressable>
        </View>
      ) : (
        <>
          {/* ── Top weakness card ─────────────────────────────────────────── */}
          {summary.tags.length > 0 && (
            <View style={styles.topCard}>
              <Text style={styles.topCardLabel}>YOUR #1 WEAKNESS</Text>
              <Text style={styles.topCardTag}>{summary.tags[0].label}</Text>
              <Text style={styles.topCardCount}>
                Appeared in {summary.tags[0].count}{' '}
                {summary.tags[0].count === 1 ? 'game' : 'games'}
              </Text>
              <Text style={styles.topCardTip}>{TAG_TIPS[summary.tags[0].tag]}</Text>
            </View>
          )}

          {/* ── All patterns list ─────────────────────────────────────────── */}
          <Text style={styles.sectionTitle}>All Patterns</Text>
          {summary.tags.map((item) => (
            <View key={item.tag} style={styles.patternRow}>
              <Text style={styles.patternLabel}>{item.label}</Text>
              <View style={styles.countBadge}>
                <Text style={styles.countText}>{item.count}</Text>
              </View>
            </View>
          ))}

          {/* ── Progress section ──────────────────────────────────────────── */}
          <Text style={styles.sectionTitle}>Improvement Over Time</Text>
          {weekRows.map((row) => (
            <View key={row.label} style={styles.weekRow}>
              <Text style={styles.weekLabel}>{row.label}</Text>
              <View style={styles.weekBarTrack}>
                <View
                  style={[
                    styles.weekBarFill,
                    {
                      width: `${Math.round((row.count / maxWeekCount) * 100)}%`,
                    },
                  ]}
                />
              </View>
              <Text style={styles.weekCount}>{row.count}</Text>
            </View>
          ))}
        </>
      )}
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
    paddingTop: spacing.xxl,
    paddingBottom: spacing.xl,
  },
  title: {
    color: colors.textPrimary,
    fontFamily: fonts.headline,
    fontSize: 28,
    marginBottom: 6,
  },
  subtitle: {
    color: colors.textSecondary,
    fontFamily: fonts.body,
    fontSize: 13,
    marginBottom: 24,
  },
  // Empty state
  emptyCard: {
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.md,
    padding: 32,
    alignItems: 'center',
  },
  emptyHeading: {
    color: colors.textPrimary,
    fontFamily: fonts.subheadline,
    fontSize: 18,
    marginBottom: 8,
    textAlign: 'center',
  },
  emptyBody: {
    color: colors.textSecondary,
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 22,
    textAlign: 'center',
  },
  emptyButton: {
    marginTop: 20,
    backgroundColor: colors.accent,
    borderRadius: radius.sm,
    paddingVertical: 12,
    paddingHorizontal: spacing.lg,
  },
  emptyButtonText: {
    color: colors.bg,
    fontFamily: fonts.subheadline,
    fontSize: 14,
  },
  // Top weakness card
  topCard: {
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.md,
    padding: 20,
    marginBottom: spacing.lg,
    borderLeftWidth: 4,
    borderLeftColor: colors.danger,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 8,
  },
  topCardLabel: {
    color: colors.textMuted,
    fontFamily: fonts.ui,
    fontSize: 10,
    letterSpacing: 2,
    marginBottom: 8,
  },
  topCardTag: {
    color: colors.textPrimary,
    fontFamily: fonts.headline,
    fontSize: 24,
  },
  topCardCount: {
    color: colors.textSecondary,
    fontFamily: fonts.body,
    fontSize: 13,
    marginTop: 4,
  },
  topCardTip: {
    color: colors.textSecondary,
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 20,
    marginTop: 8,
  },
  // Section header
  sectionTitle: {
    color: colors.textPrimary,
    fontFamily: fonts.subheadline,
    fontSize: 18,
    marginTop: 24,
    marginBottom: 12,
  },
  // Pattern rows
  patternRow: {
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.sm,
    padding: 14,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  patternLabel: {
    color: colors.textPrimary,
    fontFamily: fonts.subheadline,
    fontSize: 15,
  },
  countBadge: {
    backgroundColor: colors.accent,
    borderRadius: radius.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  countText: {
    color: colors.bg,
    fontFamily: fonts.ui,
    fontSize: 13,
  },
  // Weekly progress
  weekRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: spacing.sm,
  },
  weekLabel: {
    color: colors.textSecondary,
    fontFamily: fonts.body,
    fontSize: 12,
    width: 90,
  },
  weekBarTrack: {
    flex: 1,
    height: 6,
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  weekBarFill: {
    height: 6,
    backgroundColor: colors.accent,
    borderRadius: radius.full,
  },
  weekCount: {
    color: colors.textSecondary,
    fontFamily: fonts.ui,
    fontSize: 12,
    width: 20,
    textAlign: 'right',
  },
});
