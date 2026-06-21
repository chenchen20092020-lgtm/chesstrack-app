import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { clearRatings, getUsername, saveUsername } from '@/lib/storage';
import { colors, fonts, radius, shadows, spacing } from '@/lib/theme';

type PlatformKey = 'Chess.com' | 'Lichess';

// Returns the AsyncStorage keys used by ChessTrack.
function getAllStorageKeys(): string[] {
  return [
    'rating_history',
    'game_history',
    'journal_entries',
    'username_chesscom',
    'username_lichess',
  ];
}

// Renders a section title label.
function SectionLabel({ children }: { children: string }): React.JSX.Element {
  return <Text style={styles.sectionLabel}>{children}</Text>;
}

// Renders a 1px divider line.
function Divider(): React.JSX.Element {
  return <View style={styles.divider} />;
}

// Renders the Settings screen.
export default function SettingsScreen(): React.JSX.Element {
  const [chesscomUsername, setChesscomUsername] = useState<string | null>(null);
  const [lichessUsername, setLichessUsername] = useState<string | null>(null);
  const [editPlatform, setEditPlatform] = useState<PlatformKey | null>(null);
  const [editValue, setEditValue] = useState<string>('');
  const [isEditOpen, setIsEditOpen] = useState<boolean>(false);

  // Loads saved usernames from storage.
  const loadAccounts = useCallback(async () => {
    try {
      const chesscom = await getUsername('Chess.com');
      const lichess = await getUsername('Lichess');
      setChesscomUsername(chesscom);
      setLichessUsername(lichess);
    } catch {
      setChesscomUsername(null);
      setLichessUsername(null);
    }
  }, []);

  useEffect(() => {
    loadAccounts();
  }, [loadAccounts]);

  const accounts = useMemo(
    () => [
      { platform: 'Chess.com' as const, value: chesscomUsername },
      { platform: 'Lichess' as const, value: lichessUsername },
    ],
    [chesscomUsername, lichessUsername]
  );

  // Opens the edit modal for a given platform.
  const openEdit = useCallback((platform: PlatformKey, current: string | null) => {
    setEditPlatform(platform);
    setEditValue(current ?? '');
    setIsEditOpen(true);
  }, []);

  // Saves the edited username and refreshes the screen state.
  const saveEdit = useCallback(async () => {
    if (!editPlatform) return;
    try {
      await saveUsername(editPlatform, editValue);
      setIsEditOpen(false);
      setEditPlatform(null);
      await loadAccounts();
    } catch {
      Alert.alert('Error', 'Could not update username.');
    }
  }, [editPlatform, editValue, loadAccounts]);

  // Clears journal entries from AsyncStorage.
  const clearJournalEntries = useCallback(async () => {
    await AsyncStorage.removeItem('journal_entries');
  }, []);

  // Clears all ChessTrack data from AsyncStorage.
  const clearAllData = useCallback(async () => {
    await AsyncStorage.multiRemove(getAllStorageKeys());
  }, []);

  // Shows a destructive confirmation alert and runs the provided action.
  const confirmDestructive = useCallback(
    (title: string, onConfirm: () => Promise<void>) => {
      Alert.alert(title, 'Are you sure? This cannot be undone', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            try {
              await onConfirm();
              await loadAccounts();
            } catch {
              Alert.alert('Error', 'Could not clear data.');
            }
          },
        },
      ]);
    },
    [loadAccounts]
  );

  return (
    <View style={styles.container}>
      <Text style={styles.headerTitle}>Settings</Text>
      <Text style={styles.headerSubtitle}>Manage your ChessTrack</Text>

      <View style={styles.card}>
        <SectionLabel>YOUR ACCOUNTS</SectionLabel>
        {accounts.map((row, idx) => (
          <View key={row.platform}>
            <View style={styles.row}>
              <View style={styles.rowLeft}>
                <Text style={styles.rowTitle}>{row.platform}</Text>
                <Text style={styles.rowValue}>
                  {row.value ? row.value : 'Not connected'}
                </Text>
              </View>
              <Pressable
                onPress={() => openEdit(row.platform, row.value)}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel={`Edit ${row.platform} username`}
                style={({ pressed }) => pressed && styles.pressed}
              >
                <Ionicons name="create-outline" size={18} color={colors.textSecondary} />
              </Pressable>
            </View>
            {idx === 0 ? <Divider /> : null}
          </View>
        ))}
      </View>

      <View style={styles.card}>
        <SectionLabel>DATA</SectionLabel>
        <Pressable
          style={({ pressed }) => [styles.dangerButton, pressed && styles.pressed]}
          onPress={() => confirmDestructive('Clear Rating History', clearRatings)}
        >
          <Text style={styles.dangerButtonText}>Clear Rating History</Text>
        </Pressable>
        <Divider />
        <Pressable
          style={({ pressed }) => [styles.dangerButton, pressed && styles.pressed]}
          onPress={() => confirmDestructive('Clear Journal Entries', clearJournalEntries)}
        >
          <Text style={styles.dangerButtonText}>Clear Journal Entries</Text>
        </Pressable>
        <Divider />
        <Pressable
          style={({ pressed }) => [styles.dangerButton, pressed && styles.pressed]}
          onPress={() => confirmDestructive('Clear All Data', clearAllData)}
        >
          <Text style={[styles.dangerButtonText, styles.dangerButtonBold]}>Clear All Data</Text>
        </Pressable>
      </View>

      <View style={styles.card}>
        <SectionLabel>ABOUT</SectionLabel>
        <Text style={styles.aboutName}>ChessTrack</Text>
        <Text style={styles.aboutVersion}>1.0.0</Text>
        <Text style={styles.aboutTagline}>Your personal chess improvement system</Text>
      </View>

      <Modal visible={isEditOpen} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              {editPlatform ? `Edit ${editPlatform} username` : 'Edit username'}
            </Text>
            <TextInput
              value={editValue}
              onChangeText={setEditValue}
              placeholder="Enter username"
              placeholderTextColor={colors.textSecondary}
              autoCapitalize="none"
              style={styles.modalInput}
            />
            <View style={styles.modalActions}>
              <Pressable
                onPress={() => {
                  setIsEditOpen(false);
                  setEditPlatform(null);
                }}
                style={({ pressed }) => [styles.modalButton, pressed && styles.pressed]}
              >
                <Text style={styles.modalButtonText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={saveEdit}
                style={({ pressed }) => [
                  styles.modalButton,
                  styles.modalButtonPrimary,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={[styles.modalButtonText, styles.modalButtonPrimaryText]}>Save</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
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
  headerTitle: {
    color: colors.textPrimary,
    fontSize: 28,
    lineHeight: 34,
    marginBottom: 8,
    fontFamily: fonts.headline,
    letterSpacing: 0.5,
  },
  headerSubtitle: {
    color: colors.textSecondary,
    fontSize: 14,
    marginBottom: 24,
    fontFamily: fonts.body,
    letterSpacing: 0,
  },
  sectionLabel: {
    color: colors.textMuted,
    fontSize: 10,
    fontFamily: fonts.ui,
    letterSpacing: 2,
    marginBottom: 12,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.card,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
  rowLeft: {
    flex: 1,
    paddingRight: 12,
  },
  rowTitle: {
    color: colors.textPrimary,
    fontSize: 15,
    marginBottom: 4,
    fontFamily: fonts.subheadline,
    letterSpacing: 0,
  },
  rowValue: {
    color: colors.textSecondary,
    fontSize: 13,
    fontFamily: fonts.body,
    letterSpacing: 0,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
  },
  dangerButton: {
    minHeight: 44,
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.75,
  },
  dangerButtonText: {
    color: colors.danger,
    fontSize: 14,
    fontFamily: fonts.ui,
    letterSpacing: 0,
  },
  dangerButtonBold: {
    fontWeight: '700',
  },
  aboutName: {
    color: colors.accent,
    fontSize: 20,
    fontFamily: fonts.headline,
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  aboutVersion: {
    color: colors.textSecondary,
    fontSize: 13,
    marginBottom: 8,
    fontFamily: fonts.body,
    letterSpacing: 0,
  },
  aboutTagline: {
    color: colors.textSecondary,
    fontSize: 13,
    fontFamily: fonts.body,
    letterSpacing: 0,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalTitle: {
    color: colors.textPrimary,
    fontSize: 16,
    marginBottom: 12,
    fontFamily: fonts.subheadline,
    letterSpacing: 0.5,
  },
  modalInput: {
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    color: colors.textPrimary,
    paddingHorizontal: 12,
    fontFamily: fonts.body,
    letterSpacing: 0,
    marginBottom: 14,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  modalButton: {
    minHeight: 44,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalButtonPrimary: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  modalButtonText: {
    color: colors.textPrimary,
    fontSize: 13,
    fontFamily: fonts.ui,
    letterSpacing: 0,
  },
  modalButtonPrimaryText: {
    color: colors.bg,
  },
});
