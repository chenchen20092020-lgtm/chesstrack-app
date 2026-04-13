import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

import { colors, fonts, radius, spacing } from '@/lib/theme';
import { saveRating, saveUsername } from '@/lib/storage';
const ONBOARDING_KEY = 'onboarding_complete';

async function completeOnboarding(): Promise<void> {
  await AsyncStorage.setItem(ONBOARDING_KEY, 'true');
}

// ─── Slide 1 ────────────────────────────────────────────────────────────────

function SlideWelcome(): React.JSX.Element {
  return (
    <View style={styles.slide}>
      <Text style={styles.kingSymbol}>♔</Text>
      <Text style={styles.welcomeTitle}>Welcome to ChessTrack</Text>
      <Text style={styles.welcomeSubtitle}>
        Stop guessing why you lose. Start knowing how to improve.
      </Text>
    </View>
  );
}

// ─── Slide 2 ────────────────────────────────────────────────────────────────

type SlideConnectProps = {
  onSkip: () => void;
};

function SlideConnect({ onSkip }: SlideConnectProps): React.JSX.Element {
  const [platform, setPlatform] = useState<'Chess.com' | 'Lichess'>('Chess.com');
  const [username, setUsername] = useState('');
  const [connected, setConnected] = useState(false);
  const [saving, setSaving] = useState(false);

  async function handleConnect() {
    const trimmed = username.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      await saveUsername(platform, trimmed);
      setConnected(true);
      setTimeout(() => setConnected(false), 1000);
    } finally {
      setSaving(false);
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.slide}
    >
      <ScrollView
        contentContainerStyle={styles.slideScroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.slideTitle}>Connect Your Account</Text>
        <Text style={styles.slideSubtitle}>
          Automatically sync your games from Chess.com or Lichess
        </Text>

        <View style={styles.platformRow}>
          {(['Chess.com', 'Lichess'] as const).map((p) => (
            <Pressable
              key={p}
              onPress={() => setPlatform(p)}
              style={[
                styles.platformCard,
                platform === p ? styles.platformCardActive : styles.platformCardInactive,
              ]}
            >
              <Text style={styles.platformName}>{p}</Text>
            </Pressable>
          ))}
        </View>

        <TextInput
          style={styles.input}
          placeholder="Enter your username"
          placeholderTextColor={colors.textMuted}
          value={username}
          onChangeText={setUsername}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="default"
          returnKeyType="done"
          onSubmitEditing={handleConnect}
        />

        <Pressable
          style={[styles.primaryButton, saving && styles.primaryButtonDisabled]}
          onPress={handleConnect}
          disabled={saving}
        >
          <Text style={styles.primaryButtonText}>
            {connected ? 'Connected!' : 'Connect'}
          </Text>
        </Pressable>

        <Pressable onPress={onSkip}>
          <Text style={styles.skipText}>Skip for now</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ─── Slide 3 ────────────────────────────────────────────────────────────────

type SlideGoalProps = {
  onSkip: () => void;
};

function SlideGoal({ onSkip }: SlideGoalProps): React.JSX.Element {
  const [currentRating, setCurrentRating] = useState('');
  const [goalRating, setGoalRating] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleStart() {
    setError('');
    const current = parseInt(currentRating, 10);
    const goal = parseInt(goalRating, 10);

    if (currentRating && goalRating) {
      if (isNaN(current) || isNaN(goal)) {
        setError('Please enter valid numbers.');
        return;
      }
      if (goal <= current) {
        setError('Goal must be higher than your current rating.');
        return;
      }
    }

    setSaving(true);
    try {
      if (!isNaN(current) && currentRating) {
        await saveRating({
          id: `onboarding-${Date.now()}`,
          date: new Date().toISOString(),
          rating: current,
          platform: 'Chess.com',
        });
      }
      if (!isNaN(goal) && goalRating) {
        await AsyncStorage.setItem('rating_goal', String(goal));
      }
      await completeOnboarding();
      router.replace('/(tabs)');
    } finally {
      setSaving(false);
    }
  }

  async function handleSkip() {
    await completeOnboarding();
    router.replace('/(tabs)');
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.slide}
    >
      <ScrollView
        contentContainerStyle={styles.slideScroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.slideTitle}>Set Your First Goal</Text>
        <Text style={styles.slideSubtitle}>
          Give your training direction. You can change this anytime.
        </Text>

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Your current rating</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. 800"
            placeholderTextColor={colors.textMuted}
            value={currentRating}
            onChangeText={(v) => {
              setCurrentRating(v);
              setError('');
            }}
            keyboardType="numeric"
            returnKeyType="next"
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Your rating goal</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. 1000"
            placeholderTextColor={colors.textMuted}
            value={goalRating}
            onChangeText={(v) => {
              setGoalRating(v);
              setError('');
            }}
            keyboardType="numeric"
            returnKeyType="done"
            onSubmitEditing={handleStart}
          />
        </View>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <Pressable
          style={[styles.primaryButton, saving && styles.primaryButtonDisabled]}
          onPress={handleStart}
          disabled={saving}
        >
          <Text style={styles.primaryButtonText}>Start Training</Text>
        </Pressable>

        <Pressable onPress={handleSkip}>
          <Text style={styles.skipText}>Skip for now</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ─── Progress dots ───────────────────────────────────────────────────────────

type DotsProps = { current: number; total: number };

function Dots({ current, total }: DotsProps): React.JSX.Element {
  return (
    <View style={styles.dotsRow}>
      {Array.from({ length: total }, (_, i) => (
        <View
          key={i}
          style={[styles.dot, i === current ? styles.dotActive : styles.dotInactive]}
        />
      ))}
    </View>
  );
}

// ─── Root screen ─────────────────────────────────────────────────────────────

export default function OnboardingScreen(): React.JSX.Element {
  console.log('Onboarding screen rendered');
  const [slide, setSlide] = useState(0);
  const TOTAL = 3;

  function goNext() {
    if (slide < TOTAL - 1) setSlide(slide + 1);
  }

  function goBack() {
    if (slide > 0) setSlide(slide - 1);
  }

  async function skipToApp() {
    await completeOnboarding();
    router.replace('/(tabs)');
  }

  const slideContent = [
    <SlideWelcome key="welcome" />,
    <SlideConnect key="connect" onSkip={goNext} />,
    <SlideGoal key="goal" onSkip={skipToApp} />,
  ];

  return (
    <View style={styles.container}>
      {/* Back chevron */}
      <View style={styles.topBar}>
        {slide > 0 ? (
          <Pressable onPress={goBack} style={styles.backButton} hitSlop={12}>
            <Ionicons name="chevron-back" size={24} color={colors.textSecondary} />
          </Pressable>
        ) : (
          <View style={styles.backButton} />
        )}
      </View>

      {/* Slide content */}
      <View style={styles.slideContainer}>{slideContent[slide]}</View>

      {/* Bottom nav */}
      <View style={styles.bottomBar}>
        <Dots current={slide} total={TOTAL} />
        {slide < TOTAL - 1 && (
          <Pressable onPress={goNext} hitSlop={12}>
            <Text style={styles.nextText}>Next →</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  topBar: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl + spacing.sm,
    paddingBottom: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
  },
  backButton: {
    width: 32,
    height: 32,
    justifyContent: 'center',
  },
  slideContainer: {
    flex: 1,
  },
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl + spacing.sm,
    paddingTop: spacing.md,
  },
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  dot: {
    height: 8,
    borderRadius: radius.full,
  },
  dotActive: {
    width: 20,
    backgroundColor: colors.accent,
  },
  dotInactive: {
    width: 8,
    backgroundColor: colors.border,
  },
  nextText: {
    color: colors.accent,
    fontFamily: fonts.ui,
    fontSize: 15,
  },
  // Slide 1
  slide: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    justifyContent: 'center',
  },
  slideScroll: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
  },
  kingSymbol: {
    color: colors.accent,
    fontSize: 80,
    textAlign: 'center',
  },
  welcomeTitle: {
    color: colors.textPrimary,
    fontFamily: fonts.headline,
    fontSize: 32,
    textAlign: 'center',
    marginTop: 24,
  },
  welcomeSubtitle: {
    color: colors.textSecondary,
    fontFamily: fonts.body,
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
    marginTop: 12,
    paddingHorizontal: 32,
  },
  // Slides 2 & 3
  slideTitle: {
    color: colors.textPrimary,
    fontFamily: fonts.headline,
    fontSize: 28,
    textAlign: 'center',
  },
  slideSubtitle: {
    color: colors.textSecondary,
    fontFamily: fonts.body,
    fontSize: 15,
    textAlign: 'center',
    marginTop: 8,
    paddingHorizontal: 32,
  },
  platformRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xl,
  },
  platformCard: {
    flex: 1,
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.md,
    padding: 20,
  },
  platformCardActive: {
    borderWidth: 2,
    borderColor: colors.accent,
  },
  platformCardInactive: {
    borderWidth: 1,
    borderColor: colors.border,
  },
  platformName: {
    color: colors.textPrimary,
    fontFamily: fonts.subheadline,
    fontSize: 16,
    textAlign: 'center',
  },
  input: {
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.sm,
    padding: 14,
    color: colors.textPrimary,
    fontFamily: fonts.body,
    fontSize: 15,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: spacing.md,
  },
  primaryButton: {
    backgroundColor: colors.accent,
    borderRadius: radius.sm,
    padding: 14,
    marginTop: spacing.md,
    alignItems: 'center',
  },
  primaryButtonDisabled: {
    opacity: 0.5,
  },
  primaryButtonText: {
    color: colors.bg,
    fontFamily: fonts.subheadline,
    fontSize: 15,
  },
  skipText: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 13,
    textAlign: 'center',
    marginTop: 12,
  },
  inputGroup: {
    marginTop: spacing.md,
  },
  inputLabel: {
    color: colors.textSecondary,
    fontFamily: fonts.ui,
    fontSize: 12,
    marginBottom: 6,
  },
  errorText: {
    color: colors.danger,
    fontFamily: fonts.body,
    fontSize: 13,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
});
