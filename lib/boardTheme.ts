import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';

const BOARD_THEME_KEY = 'board_theme';

export type BoardThemeKey = 'walnut' | 'tournament' | 'glacier';

export type BoardTheme = {
  key: BoardThemeKey;
  label: string;
  light: string;
  dark: string;
};

// The three classics players expect: wood, tournament green, and cool blue.
export const BOARD_THEMES: Record<BoardThemeKey, BoardTheme> = {
  walnut: { key: 'walnut', label: 'Walnut', light: '#C9B79A', dark: '#3B332A' },
  tournament: { key: 'tournament', label: 'Tournament', light: '#EBECD0', dark: '#739552' },
  glacier: { key: 'glacier', label: 'Glacier', light: '#DEE3E6', dark: '#7D95A5' },
};

let cachedKey: BoardThemeKey = 'walnut';
const listeners = new Set<(key: BoardThemeKey) => void>();

// Returns the currently selected theme from the in-memory cache.
export function getBoardTheme(): BoardTheme {
  return BOARD_THEMES[cachedKey];
}

// Hydrates the cache from storage. Called once at app start.
export async function loadBoardTheme(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(BOARD_THEME_KEY);
    if (raw && raw in BOARD_THEMES) {
      cachedKey = raw as BoardThemeKey;
      listeners.forEach((l) => l(cachedKey));
    }
  } catch {
    // keep the default
  }
}

// Persists and broadcasts a new theme choice.
export async function setBoardTheme(key: BoardThemeKey): Promise<void> {
  cachedKey = key;
  listeners.forEach((l) => l(key));
  try {
    await AsyncStorage.setItem(BOARD_THEME_KEY, key);
  } catch {
    // cache still holds the choice for this session
  }
}

// Live board theme for screens that render a chessboard.
export function useBoardTheme(): BoardTheme {
  const [key, setKey] = useState<BoardThemeKey>(cachedKey);
  useEffect(() => {
    setKey(cachedKey);
    const listener = (k: BoardThemeKey) => setKey(k);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);
  return BOARD_THEMES[key];
}
