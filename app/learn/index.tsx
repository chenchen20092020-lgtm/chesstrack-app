import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { FontAwesome5, Ionicons } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import { colors, fonts, radius, shadows, spacing } from '@/lib/theme';
import { LESSONS } from '@/lib/lessons';

// Renders the beginner learning hub — a grid of piece "worlds" to enter.
export default function LearnHub(): React.JSX.Element {
  const insets = useSafeAreaInsets();

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

        <Text style={styles.title}>Learn Chess</Text>
        <Text style={styles.subtitle}>Master each piece, one world at a time</Text>
        <Text style={styles.intro}>
          New to chess? Start here. Tap a piece to enter its world and learn how it moves,
          how to develop it, and how to use it to win.
        </Text>

        <View style={styles.grid}>
          {LESSONS.map((lesson) => (
            <Pressable
              key={lesson.key}
              onPress={() => router.push(`/learn/${lesson.key}` as Href)}
              accessibilityRole="button"
              accessibilityLabel={`Learn the ${lesson.name}`}
              style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
            >
              <View style={styles.iconWrap}>
                <FontAwesome5 name={lesson.icon} size={40} color={colors.accent} />
              </View>
              <Text style={styles.cardName}>{lesson.name}</Text>
              <Text style={styles.cardTagline} numberOfLines={1}>
                {lesson.tagline}
              </Text>
              <View style={styles.cardFooter}>
                <Text style={styles.cardValue}>{lesson.value}</Text>
                <Text style={styles.cardEnter}>Enter →</Text>
              </View>
            </Pressable>
          ))}
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
  content: {
    paddingHorizontal: spacing.lg,
  },
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.lg,
    alignSelf: 'flex-start',
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
  title: {
    color: colors.textPrimary,
    fontFamily: fonts.headline,
    fontSize: 32,
    letterSpacing: 0.5,
    marginBottom: spacing.xs,
  },
  subtitle: {
    color: colors.accent,
    fontFamily: fonts.subheadline,
    fontSize: 15,
    letterSpacing: 0.5,
    marginBottom: spacing.md,
  },
  intro: {
    color: colors.textSecondary,
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 20,
    marginBottom: spacing.xl,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  card: {
    width: '48%',
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    ...shadows.card,
  },
  cardPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.97 }],
  },
  iconWrap: {
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  cardName: {
    color: colors.textPrimary,
    fontFamily: fonts.headline,
    fontSize: 20,
    letterSpacing: 0.5,
  },
  cardTagline: {
    color: colors.textSecondary,
    fontFamily: fonts.body,
    fontSize: 12,
    marginTop: 2,
    marginBottom: spacing.sm,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardValue: {
    color: colors.gold,
    fontFamily: fonts.ui,
    fontSize: 11,
    letterSpacing: 0.5,
  },
  cardEnter: {
    color: colors.accent,
    fontFamily: fonts.subheadline,
    fontSize: 13,
    letterSpacing: 0.5,
  },
});
