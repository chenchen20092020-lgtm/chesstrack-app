import React, { useState } from 'react';
import {
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import Constants from 'expo-constants';

import { colors, fonts, radius, shadows, spacing } from '@/lib/theme';

// Where feedback is sent. Change this to your own address.
const FEEDBACK_EMAIL = 'chenchen20092020@gmail.com';

const CATEGORIES = ['Bug', 'Feature idea', 'Other'] as const;
type Category = (typeof CATEGORIES)[number];

const PLACEHOLDERS: Record<Category, string> = {
  Bug: 'What happened? What did you expect instead? Steps to reproduce help a lot.',
  'Feature idea': 'What would you like ChessTrack to do?',
  Other: 'Share anything on your mind…',
};

// Renders the feedback / bug-report screen. Submitting opens the user's mail
// app pre-filled to the developer, with device + app info attached.
export default function FeedbackScreen(): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const [category, setCategory] = useState<Category>('Bug');
  const [message, setMessage] = useState('');
  const [contact, setContact] = useState('');
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  const submit = async () => {
    if (!message.trim()) {
      setError('Please describe your feedback first.');
      return;
    }
    setError('');
    const version = Constants.expoConfig?.version ?? '1.0.0';
    const subject = `[ChessTrack] ${category}`;
    const body =
      `${message.trim()}\n\n` +
      `— — —\n` +
      `Type: ${category}\n` +
      (contact.trim() ? `Reply to: ${contact.trim()}\n` : '') +
      `App version: ${version}\n` +
      `Device: ${Platform.OS} ${Platform.Version}`;
    const url = `mailto:${FEEDBACK_EMAIL}?subject=${encodeURIComponent(
      subject
    )}&body=${encodeURIComponent(body)}`;
    try {
      await Linking.openURL(url);
      setSent(true);
    } catch {
      setError(`Couldn’t open your email app. Please email ${FEEDBACK_EMAIL} directly.`);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar style="light" backgroundColor={colors.bg} />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + spacing.xl },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          style={({ pressed }) => [styles.backRow, pressed && styles.pressed]}
        >
          <Ionicons name="chevron-back" size={20} color={colors.textSecondary} />
          <Text style={styles.backText}>Settings</Text>
        </Pressable>

        <Text style={styles.title}>Send Feedback</Text>
        <Text style={styles.subtitle}>Found a bug or have an idea? Tell us.</Text>

        {sent ? (
          <View style={styles.sentCard}>
            <View style={styles.checkCircle}>
              <Ionicons name="checkmark" size={22} color={colors.bg} />
            </View>
            <Text style={styles.sentTitle}>Your email is ready</Text>
            <Text style={styles.sentBody}>
              We opened your mail app with everything filled in — just hit send. Thank you!
            </Text>
            <Pressable
              onPress={() => router.back()}
              style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
            >
              <Text style={styles.primaryButtonText}>Done</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <Text style={styles.label}>Type</Text>
            <View style={styles.pillRow}>
              {CATEGORIES.map((c) => {
                const active = category === c;
                return (
                  <Pressable
                    key={c}
                    onPress={() => setCategory(c)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    style={({ pressed }) => [
                      styles.pill,
                      active ? styles.pillActive : styles.pillInactive,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text style={[styles.pillText, active ? styles.pillTextActive : null]}>{c}</Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={styles.label}>Message</Text>
            <TextInput
              value={message}
              onChangeText={(t) => {
                setMessage(t);
                if (error) setError('');
              }}
              placeholder={PLACEHOLDERS[category]}
              placeholderTextColor={colors.textMuted}
              multiline
              textAlignVertical="top"
              style={styles.messageInput}
            />

            <Text style={styles.label}>Your email (optional, so we can reply)</Text>
            <TextInput
              value={contact}
              onChangeText={setContact}
              placeholder="you@example.com"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              keyboardType="email-address"
              style={styles.contactInput}
            />

            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            <Pressable
              onPress={submit}
              accessibilityRole="button"
              style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
            >
              <Ionicons name="paper-plane-outline" size={18} color={colors.bg} />
              <Text style={styles.primaryButtonText}>Send</Text>
            </Pressable>
            <Text style={styles.note}>
              This opens your email app, pre-filled. App and device info are attached to help us
              debug.
            </Text>
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
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: spacing.lg,
  },
  pill: {
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
    marginBottom: spacing.sm,
  },
  pillInactive: {
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pillActive: {
    backgroundColor: colors.accent,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  pillText: {
    color: colors.textSecondary,
    fontFamily: fonts.ui,
    fontSize: 13,
  },
  pillTextActive: {
    color: colors.bg,
  },
  messageInput: {
    minHeight: 130,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    color: colors.textPrimary,
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: spacing.lg,
  },
  contactInput: {
    height: 46,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    color: colors.textPrimary,
    fontFamily: fonts.body,
    fontSize: 14,
    marginBottom: spacing.lg,
  },
  errorText: {
    color: colors.danger,
    fontFamily: fonts.body,
    fontSize: 13,
    marginBottom: spacing.md,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    minHeight: 52,
    ...shadows.accent,
  },
  primaryButtonText: {
    color: colors.bg,
    fontFamily: fonts.subheadline,
    fontSize: 16,
    letterSpacing: 0.5,
    marginLeft: spacing.sm,
  },
  note: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 11,
    lineHeight: 16,
    marginTop: spacing.md,
  },
  sentCard: {
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.lg,
    alignItems: 'center',
    ...shadows.card,
  },
  checkCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.success,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  sentTitle: {
    color: colors.textPrimary,
    fontFamily: fonts.headline,
    fontSize: 20,
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },
  sentBody: {
    color: colors.textSecondary,
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
});
