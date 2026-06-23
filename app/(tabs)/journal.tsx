import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { MotiView } from 'moti';
import type { AudioRecorder } from 'expo-audio';

import {
  deleteJournalEntry,
  getJournalEntries,
  JournalEntry,
  saveJournalEntry,
} from '@/lib/storage';
import { colors, fonts, radius, shadows, spacing } from '@/lib/theme';
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

// Formats seconds to m:ss for recording timer.
function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

// Formats a stored ISO date into a readable value.
function formatEntryDate(date: string): string {
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) {
    return date;
  }
  return parsed.toLocaleDateString();
}

// Creates a simple unique id for journal entries.
function createJournalId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// Renders the journal tab with new entry creation and previous entries.
export default function JournalScreen(): React.JSX.Element {
  const [gameTag, setGameTag] = useState<string>('');
  const [note, setNote] = useState<string>('');
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [recorder, setRecorder] = useState<AudioRecorder | null>(null);
  const [recordingSeconds, setRecordingSeconds] = useState<number>(0);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [successMessage, setSuccessMessage] = useState<string>('');
  const [recordingStatus, setRecordingStatus] =
    useState<RecordingStatus>('idle');
  const [statusDetail, setStatusDetail] = useState<string>('');
  const [transcribedText, setTranscribedText] = useState<string | null>(null);
  const [summaryFormat, setSummaryFormat] = useState<SummaryFormat | null>(
    null
  );
  const [summarizing, setSummarizing] = useState<boolean>(false);
  const [micPressed, setMicPressed] = useState<boolean>(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const resetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Loads journal entries from storage.
  const loadEntries = useCallback(async () => {
    try {
      const savedEntries = await getJournalEntries();
      setEntries(savedEntries);
    } catch {
      setErrorMessage('Unable to load entries right now.');
    }
  }, []);

  useEffect(() => {
    loadEntries();
  }, [loadEntries]);

  // Cleans up timer resources when screen unmounts.
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      if (resetTimeoutRef.current) {
        clearTimeout(resetTimeoutRef.current);
      }
    };
  }, []);

  // Schedules a return to the idle state after the given delay.
  const scheduleReset = useCallback((delayMs: number) => {
    if (resetTimeoutRef.current) {
      clearTimeout(resetTimeoutRef.current);
    }
    resetTimeoutRef.current = setTimeout(() => {
      setRecordingStatus('idle');
      setStatusDetail('');
    }, delayMs);
  }, []);

  // Begins recording, handling permission denial gracefully.
  const handleStartRecording = useCallback(async () => {
    setErrorMessage('');
    const newRecorder = await startRecording();
    if (!newRecorder) {
      Alert.alert(
        'Microphone permission denied',
        'Enable it in settings.'
      );
      return;
    }

    setRecorder(newRecorder);
    setRecordingSeconds(0);
    setRecordingStatus('recording');
    setStatusDetail('');

    timerRef.current = setInterval(() => {
      setRecordingSeconds((value) => value + 1);
    }, 1000);
  }, []);

  // Stops recording, transcribes with Groq, and appends the result to the note.
  const handleStopAndTranscribe = useCallback(async () => {
    if (!recorder) {
      return;
    }

    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    setRecordingStatus('transcribing');
    setStatusDetail('');

    const uri = await stopRecording(recorder);
    setRecorder(null);

    if (!uri) {
      setRecordingStatus('error');
      scheduleReset(3000);
      return;
    }

    const online = await isOnline();
    if (!online) {
      setRecordingStatus('error');
      setStatusDetail(
        'No internet. Voice transcription requires internet.'
      );
      scheduleReset(3000);
      return;
    }

    const text = await transcribeAudio(uri);
    if (!text) {
      setRecordingStatus('error');
      scheduleReset(3000);
      return;
    }

    // Park the transcription and let the user choose how to summarize it.
    setTranscribedText(text);
    setSummaryFormat(null);
    setRecordingStatus('done');
    setStatusDetail('');
  }, [recorder, scheduleReset]);

  // Appends the given text to the note, separating with a blank line.
  const appendToNote = useCallback((text: string) => {
    setNote((prev) => (prev ? `${prev}\n\n${text}` : text));
  }, []);

  // Resets the summary card state and returns the mic UI to idle.
  const clearSummaryState = useCallback(() => {
    setTranscribedText(null);
    setSummaryFormat(null);
    setSummarizing(false);
    setRecordingStatus('idle');
    setStatusDetail('');
  }, []);

  // Handles tapping one of the summary format options.
  const handleSummaryFormatSelect = useCallback(
    async (format: SummaryFormat) => {
      if (!transcribedText || summarizing) {
        return;
      }

      setSummaryFormat(format);

      if (format === 'raw') {
        appendToNote(transcribedText);
        clearSummaryState();
        setSuccessMessage('Added to your reflection — tap Save Entry to keep it');
        setTimeout(() => setSuccessMessage(''), 3000);
        return;
      }

      setSummarizing(true);
      const summary = await summarizeTranscription(transcribedText, format);
      setSummarizing(false);

      if (summary) {
        appendToNote(summary);
        setSuccessMessage('Added to your reflection — tap Save Entry to keep it');
        setTimeout(() => setSuccessMessage(''), 3000);
      } else {
        setErrorMessage('Summarization timed out. Raw text added instead.');
        appendToNote(transcribedText);
        setTimeout(() => setErrorMessage(''), 3000);
      }
      clearSummaryState();
    },
    [appendToNote, clearSummaryState, summarizing, transcribedText]
  );

  // Dismisses the summary card, keeping raw transcription in the note.
  const handleSummaryDismiss = useCallback(() => {
    if (transcribedText) {
      appendToNote(transcribedText);
    }
    clearSummaryState();
  }, [appendToNote, clearSummaryState, transcribedText]);

  // Saves a journal entry after validating note input.
  const handleSaveEntry = useCallback(async () => {
    if (!note.trim()) {
      setErrorMessage('Add a note or voice recording first');
      return;
    }

    try {
      setIsSaving(true);
      setErrorMessage('');
      const now = new Date().toISOString();
      const newEntry: JournalEntry = {
        id: createJournalId(),
        date: now,
        gameTag: gameTag.trim() || 'General reflection',
        note: note.trim(),
        audioUri: null,
        createdAt: now,
      };

      await saveJournalEntry(newEntry);
      setGameTag('');
      setNote('');
      setRecordingSeconds(0);
      await loadEntries();
      setSuccessMessage('Entry saved!');
      setTimeout(() => {
        setSuccessMessage('');
      }, 2000);
    } catch {
      setErrorMessage('Could not save entry. Please try again.');
    } finally {
      setIsSaving(false);
    }
  }, [gameTag, loadEntries, note]);

  // Confirms and deletes a journal entry from storage.
  const handleDeleteEntry = useCallback(
    (id: string) => {
      Alert.alert('Delete this entry?', '', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteJournalEntry(id);
              await loadEntries();
            } catch {
              setErrorMessage('Could not delete entry.');
            }
          },
        },
      ]);
    },
    [loadEntries]
  );

  // Toggles between starting and stopping audio recording.
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

  const statusText = (() => {
    switch (recordingStatus) {
      case 'recording':
        return 'Recording... tap to stop';
      case 'transcribing':
        return 'Transcribing with AI...';
      case 'done':
        return 'Transcribed!';
      case 'error':
        return statusDetail || 'Failed. Try again.';
      default:
        return 'Tap to record';
    }
  })();

  const statusColor = (() => {
    switch (recordingStatus) {
      case 'recording':
        return colors.danger;
      case 'transcribing':
        return colors.accent;
      case 'done':
        return colors.success;
      case 'error':
        return colors.danger;
      default:
        return colors.textMuted;
    }
  })();

  const micDisabled =
    recordingStatus === 'transcribing' || !!transcribedText;
  const micIconName: React.ComponentProps<typeof Ionicons>['name'] =
    recordingStatus === 'recording' ? 'stop' : 'mic-outline';
  const micIconColor =
    recordingStatus === 'recording' ||
    recordingStatus === 'done' ||
    recordingStatus === 'error'
      ? colors.bg
      : colors.accent;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.headerTitle}>Game Journal</Text>
      <Text style={styles.headerSubtitle}>Your thoughts shape your growth</Text>

      <View style={styles.newEntryCard}>
        <TextInput
          value={gameTag}
          onChangeText={setGameTag}
          placeholder="e.g. vs Magnus, Blitz"
          placeholderTextColor={colors.textSecondary}
          style={styles.gameTagInput}
        />

        <TextInput
          value={note}
          onChangeText={setNote}
          placeholder="Write your reflection..."
          placeholderTextColor={colors.textSecondary}
          multiline
          style={styles.noteInput}
        />

        <View style={styles.recordingColumn}>
          <View style={styles.micWrap}>
            {recordingStatus === 'recording' ? (
              <MotiView
                key="pulse"
                style={styles.micPulse}
                from={{ scale: 0.9, opacity: 0.45 }}
                animate={{ scale: 1.7, opacity: 0 }}
                transition={{ type: 'timing', duration: 1400, loop: true, repeatReverse: false }}
              />
            ) : null}
            <Pressable
              onPress={handleMicPress}
              onPressIn={() => setMicPressed(true)}
              onPressOut={() => setMicPressed(false)}
              disabled={micDisabled}
              accessibilityRole="button"
              accessibilityLabel={
                recordingStatus === 'recording' ? 'Stop recording' : 'Start voice note'
              }
            >
              <MotiView
                style={styles.micOuter}
                animate={{ scale: micPressed ? 0.92 : 1 }}
                transition={{ type: 'timing', duration: 120 }}
              >
                <View
                  style={[
                    styles.micInner,
                    recordingStatus === 'recording' ? styles.micInnerRecording : null,
                    recordingStatus === 'done' ? styles.micInnerDone : null,
                    recordingStatus === 'error' ? styles.micInnerError : null,
                  ]}
                >
                  {recordingStatus === 'transcribing' ? (
                    <ActivityIndicator size="small" color={colors.accent} />
                  ) : (
                    <Ionicons name={micIconName} size={28} color={micIconColor} />
                  )}
                </View>
              </MotiView>
            </Pressable>
          </View>
          <Text style={[styles.statusText, { color: statusColor }]}>{statusText}</Text>
          {recordingStatus === 'recording' ? (
            <Text style={styles.timerText}>{formatDuration(recordingSeconds)}</Text>
          ) : null}
        </View>

        {transcribedText ? (
          <View style={styles.summaryCard}>
            <View style={styles.summaryHeader}>
              <Text style={styles.summaryTitle}>
                How should AI summarize this?
              </Text>
              <Pressable
                onPress={handleSummaryDismiss}
                disabled={summarizing}
                hitSlop={8}
              >
                <Text style={styles.summaryDismiss}>✕</Text>
              </Pressable>
            </View>

            <View style={styles.summaryPreview}>
              <Text style={styles.summaryPreviewText} numberOfLines={4}>
                {transcribedText}
              </Text>
            </View>

            {summarizing ? (
              <View style={styles.summarizingWrap}>
                <Text style={styles.summarizingText}>Summarizing...</Text>
                <ActivityIndicator
                  size="small"
                  color={colors.accent}
                  style={styles.summarizingSpinner}
                />
              </View>
            ) : (
              <View style={styles.summaryButtonsRow}>
                {(
                  [
                    {
                      key: 'bullets' as const,
                      label: 'Bullet Points',
                      icon: 'list-outline' as const,
                    },
                    {
                      key: 'paragraph' as const,
                      label: 'Paragraph',
                      icon: 'document-text-outline' as const,
                    },
                    {
                      key: 'raw' as const,
                      label: 'Keep Raw',
                      icon: 'mic-outline' as const,
                    },
                  ]
                ).map((option) => {
                  const selected = summaryFormat === option.key;
                  return (
                    <Pressable
                      key={option.key}
                      onPress={() => handleSummaryFormatSelect(option.key)}
                      accessibilityRole="button"
                      style={({ pressed }) => [
                        styles.summaryOptionButton,
                        selected ? styles.summaryOptionButtonSelected : null,
                        pressed && styles.pressed,
                      ]}
                    >
                      <Ionicons
                        name={option.icon}
                        size={16}
                        color={selected ? colors.bg : colors.textSecondary}
                      />
                      <Text
                        style={[
                          styles.summaryOptionLabel,
                          selected
                            ? styles.summaryOptionLabelSelected
                            : null,
                        ]}
                      >
                        {option.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            )}
          </View>
        ) : null}

        {!!errorMessage ? (
          <Text style={styles.errorText}>{errorMessage}</Text>
        ) : null}
        {!!successMessage ? (
          <Text style={styles.successText}>{successMessage}</Text>
        ) : null}

        <Pressable
          onPress={handleSaveEntry}
          disabled={isSaving}
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.saveButton,
            (pressed || isSaving) && styles.pressed,
          ]}
        >
          <Text style={styles.saveButtonText}>{isSaving ? 'Saving...' : 'Save Entry'}</Text>
        </Pressable>
      </View>

      <Text style={styles.previousTitle}>Previous Entries</Text>
      {entries.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>
            No entries yet. Reflect on your first game!
          </Text>
        </View>
      ) : (
        entries.map((entry) => (
          <View key={entry.id} style={styles.entryCard}>
            <View style={styles.entryTopRow}>
              <Text style={styles.entryGameTag}>{entry.gameTag}</Text>
              <Text style={styles.entryDate}>{formatEntryDate(entry.date)}</Text>
            </View>
            <Text style={styles.entryNote} numberOfLines={3}>
              {entry.note || 'Voice reflection'}
            </Text>
            <View style={styles.entryBottomRow}>
              <View />
              <Pressable
                onPress={() => handleDeleteEntry(entry.id)}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel="Delete entry"
                style={({ pressed }) => pressed && styles.pressed}
              >
                <Ionicons name="trash-outline" size={22} color={colors.textSecondary} />
              </Pressable>
            </View>
          </View>
        ))
      )}
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
  headerTitle: {
    color: colors.textPrimary,
    fontSize: 28,
    marginBottom: 6,
    fontFamily: fonts.headline,
    letterSpacing: 0.5,
  },
  headerSubtitle: {
    color: colors.textSecondary,
    fontSize: 13,
    marginBottom: 16,
    fontFamily: fonts.body,
    letterSpacing: 0,
  },
  newEntryCard: {
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    marginBottom: 16,
    ...shadows.card,
  },
  gameTagInput: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    color: colors.textPrimary,
    marginBottom: 12,
    paddingVertical: 8,
    fontFamily: fonts.ui,
    letterSpacing: 0,
  },
  noteInput: {
    minHeight: 80,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    color: colors.textPrimary,
    marginBottom: 16,
    textAlignVertical: 'top',
    fontFamily: fonts.body,
    letterSpacing: 0,
    paddingVertical: 8,
  },
  recordingColumn: {
    alignItems: 'center',
    marginBottom: 16,
  },
  micWrap: {
    width: 96,
    height: 96,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  micPulse: {
    position: 'absolute',
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.danger,
  },
  micOuter: {
    borderWidth: 1,
    borderColor: colors.accentDim,
    borderRadius: 44,
    padding: 4,
    backgroundColor: colors.surface,
  },
  micInner: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.borderLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  micInnerRecording: {
    backgroundColor: colors.danger,
    borderColor: colors.danger,
  },
  micInnerDone: {
    backgroundColor: colors.success,
    borderColor: colors.success,
  },
  micInnerError: {
    backgroundColor: colors.danger,
    borderColor: colors.danger,
  },
  timerText: {
    color: colors.textSecondary,
    marginTop: 4,
    fontFamily: fonts.body,
    letterSpacing: 0,
    fontSize: 14,
    fontVariant: ['tabular-nums'],
  },
  statusText: {
    fontSize: 12,
    fontFamily: fonts.body,
    letterSpacing: 0,
    marginTop: 4,
    textAlign: 'center',
  },
  summaryCard: {
    backgroundColor: colors.surfaceRaised,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: 16,
    marginBottom: 16,
  },
  summaryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  summaryTitle: {
    color: colors.textPrimary,
    fontFamily: fonts.subheadline,
    fontSize: 15,
    flex: 1,
    paddingRight: 8,
  },
  summaryDismiss: {
    color: colors.textMuted,
    fontFamily: fonts.ui,
    fontSize: 12,
  },
  summaryPreview: {
    backgroundColor: colors.surface,
    borderRadius: 8,
    padding: 10,
    marginBottom: 16,
  },
  summaryPreviewText: {
    color: colors.textSecondary,
    fontFamily: fonts.body,
    fontSize: 12,
    lineHeight: 18,
  },
  summaryButtonsRow: {
    flexDirection: 'row',
    marginHorizontal: -4,
  },
  summaryOptionButton: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 10,
    flex: 1,
    marginHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryOptionButtonSelected: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  summaryOptionLabel: {
    color: colors.textSecondary,
    fontFamily: fonts.ui,
    fontSize: 13,
    marginTop: 4,
  },
  summaryOptionLabelSelected: {
    color: colors.bg,
  },
  summarizingWrap: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  summarizingText: {
    color: colors.accent,
    fontFamily: fonts.body,
    fontSize: 13,
  },
  summarizingSpinner: {
    marginTop: 6,
  },
  errorText: {
    color: colors.danger,
    fontSize: 12,
    marginBottom: 8,
    fontFamily: fonts.body,
    letterSpacing: 0,
  },
  successText: {
    color: colors.success,
    fontSize: 12,
    marginBottom: 8,
    fontFamily: fonts.body,
    letterSpacing: 0,
  },
  saveButton: {
    backgroundColor: colors.accent,
    borderRadius: radius.sm,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.75,
  },
  saveButtonText: {
    color: colors.bg,
    fontFamily: fonts.subheadline,
    letterSpacing: 0.5,
    fontSize: 16,
  },
  previousTitle: {
    color: colors.textPrimary,
    marginBottom: 8,
    fontSize: 16,
    fontFamily: fonts.subheadline,
    letterSpacing: 0.5,
  },
  emptyState: {
    paddingVertical: 24,
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
  entryCard: {
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    marginBottom: 8,
    ...shadows.card,
  },
  entryTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  entryGameTag: {
    color: colors.accent,
    fontFamily: fonts.ui,
    letterSpacing: 0,
    fontSize: 12,
    flexShrink: 1,
    paddingRight: 8,
  },
  entryDate: {
    color: colors.textSecondary,
    fontFamily: fonts.body,
    letterSpacing: 0,
    fontSize: 11,
  },
  entryNote: {
    color: colors.textPrimary,
    fontSize: 13,
    fontFamily: fonts.body,
    lineHeight: 20,
    marginBottom: 12,
  },
  entryBottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
});
