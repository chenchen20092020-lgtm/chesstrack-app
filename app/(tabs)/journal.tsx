import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
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
  const pulseAnim = useRef(new Animated.Value(0.3)).current;
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

  // Starts the recording pulse animation while recording is active.
  useEffect(() => {
    if (recordingStatus !== 'recording') {
      pulseAnim.stopAnimation();
      pulseAnim.setValue(0.3);
      return;
    }

    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 700,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0.3,
          duration: 700,
          useNativeDriver: true,
        }),
      ])
    );

    pulseLoop.start();
    return () => {
      pulseLoop.stop();
    };
  }, [pulseAnim, recordingStatus]);

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
        return;
      }

      setSummarizing(true);
      const summary = await summarizeTranscription(transcribedText, format);
      setSummarizing(false);

      if (summary) {
        appendToNote(summary);
      } else {
        setErrorMessage('Summarization failed. Raw text added instead.');
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
        return '#E05A5A';
      case 'transcribing':
        return '#C9B785';
      case 'done':
        return '#6BCB8B';
      case 'error':
        return '#E05A5A';
      default:
        return '#555555';
    }
  })();

  const micDisabled =
    recordingStatus === 'transcribing' || !!transcribedText;
  const micIconName: React.ComponentProps<typeof Ionicons>['name'] =
    recordingStatus === 'recording' ? 'stop' : 'mic-outline';
  const micIconColor =
    recordingStatus === 'recording' || recordingStatus === 'done'
      ? '#FFFFFF'
      : colors.textPrimary;

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
          <View style={styles.recordingRow}>
            <View style={styles.recordingLeft}>
              {recordingStatus === 'recording' ? (
                <Animated.View
                  style={[
                    styles.pulseRing,
                    {
                      opacity: pulseAnim,
                    },
                  ]}
                />
              ) : null}
              <Pressable
                onPress={handleMicPress}
                disabled={micDisabled}
                style={[
                  styles.micButton,
                  recordingStatus === 'recording'
                    ? styles.micButtonRecording
                    : null,
                  recordingStatus === 'done' ? styles.micButtonDone : null,
                  recordingStatus === 'error' ? styles.micButtonError : null,
                ]}
              >
                {recordingStatus === 'transcribing' ? (
                  <ActivityIndicator size="small" color={colors.accent} />
                ) : (
                  <Ionicons
                    name={micIconName}
                    size={24}
                    color={micIconColor}
                  />
                )}
              </Pressable>
              {recordingStatus === 'recording' ? (
                <Text style={styles.timerText}>
                  {formatDuration(recordingSeconds)}
                </Text>
              ) : null}
            </View>
          </View>
          <Text style={[styles.statusText, { color: statusColor }]}>
            {statusText}
          </Text>
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
                  color="#C9B785"
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
                        color={selected ? '#0C0C0C' : '#888888'}
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
  recordingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  recordingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    position: 'relative',
  },
  pulseRing: {
    position: 'absolute',
    width: 70,
    height: 70,
    borderRadius: 35,
    borderWidth: 2,
    borderColor: '#E05A5A',
    left: -7,
    top: -7,
  },
  micButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#1E1E1E',
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  micButtonRecording: {
    backgroundColor: '#E05A5A',
    borderColor: '#E05A5A',
  },
  micButtonDone: {
    backgroundColor: '#6BCB8B',
    borderColor: '#6BCB8B',
  },
  micButtonError: {
    backgroundColor: '#E05A5A',
    borderColor: '#E05A5A',
  },
  timerText: {
    color: colors.textSecondary,
    marginLeft: 10,
    fontFamily: fonts.body,
    letterSpacing: 0,
    fontSize: 14,
  },
  statusText: {
    fontSize: 12,
    fontFamily: fonts.body,
    letterSpacing: 0,
    marginTop: 4,
    textAlign: 'center',
  },
  summaryCard: {
    backgroundColor: '#1E1E1E',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#2C2C2C',
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
    color: '#F5F5F5',
    fontFamily: fonts.subheadline,
    fontSize: 15,
    flex: 1,
    paddingRight: 8,
  },
  summaryDismiss: {
    color: '#555555',
    fontFamily: fonts.ui,
    fontSize: 12,
  },
  summaryPreview: {
    backgroundColor: '#161616',
    borderRadius: 8,
    padding: 10,
    marginBottom: 16,
  },
  summaryPreviewText: {
    color: '#888888',
    fontFamily: fonts.body,
    fontSize: 12,
    lineHeight: 18,
  },
  summaryButtonsRow: {
    flexDirection: 'row',
    marginHorizontal: -4,
  },
  summaryOptionButton: {
    backgroundColor: '#161616',
    borderWidth: 1,
    borderColor: '#2C2C2C',
    borderRadius: 8,
    padding: 10,
    flex: 1,
    marginHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryOptionButtonSelected: {
    backgroundColor: '#C9B785',
    borderColor: '#C9B785',
  },
  summaryOptionLabel: {
    color: '#888888',
    fontFamily: fonts.ui,
    fontSize: 13,
    marginTop: 4,
  },
  summaryOptionLabelSelected: {
    color: '#0C0C0C',
  },
  summarizingWrap: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  summarizingText: {
    color: '#C9B785',
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
