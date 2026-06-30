import AsyncStorage from '@react-native-async-storage/async-storage';

const RATING_HISTORY_KEY = 'rating_history';
const GAME_HISTORY_KEY = 'game_history';
const JOURNAL_ENTRIES_KEY = 'journal_entries';
const USERNAME_CHESSCOM_KEY = 'username_chesscom';
const USERNAME_LICHESS_KEY = 'username_lichess';

export type PlatformType = 'Chess.com' | 'Lichess';

export type RatingEntry = {
  id: string;
  date: string;
  rating: number;
  platform: PlatformType;
};

export type GameResult = 'win' | 'loss' | 'draw';

export type GameTag =
  | 'time-pressure'
  | 'opening-mistake'
  | 'endgame-mistake'
  | 'tactical-miss'
  | 'overconfident'
  | 'calculation-error'
  | 'positional-error'
  | 'other';

export type TagSummary = {
  totalTagged: number;
  tags: { tag: GameTag; count: number; label: string }[];
};

export type GameEntry = {
  id: string;
  date: string;
  opponent: string;
  result: GameResult;
  myRating: number;
  platform: string;
  timeControl: string;
  pgn?: string;
  tags?: GameTag[];
  reflection?: string;
  reviewed?: boolean;
};

export type JournalEntry = {
  id: string;
  date: string;
  gameTag: string;
  note: string;
  audioUri: string | null;
  createdAt: string;
};

// Maps a platform value to the corresponding username storage key.
function getUsernameKey(platform: string): string {
  const normalized = platform.toLowerCase();
  if (normalized === 'chess.com' || normalized === 'chesscom') {
    return USERNAME_CHESSCOM_KEY;
  }
  return USERNAME_LICHESS_KEY;
}

// Reads all rating entries from storage.
async function readRatings(): Promise<RatingEntry[]> {
  const rawValue = await AsyncStorage.getItem(RATING_HISTORY_KEY);

  if (!rawValue) {
    return [];
  }

  try {
    const parsed = JSON.parse(rawValue) as RatingEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// Writes all rating entries to storage.
async function writeRatings(entries: RatingEntry[]): Promise<void> {
  await AsyncStorage.setItem(RATING_HISTORY_KEY, JSON.stringify(entries));
}

// Adds a new rating entry to the stored history.
export async function saveRating(entry: RatingEntry): Promise<void> {
  const existingRatings = await readRatings();
  const updatedRatings = [...existingRatings, entry];
  await writeRatings(updatedRatings);
}

// Returns the full rating history sorted by date ascending.
export async function getRatings(): Promise<RatingEntry[]> {
  const ratings = await readRatings();
  return [...ratings].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );
}

// Clears all stored rating history data.
export async function clearRatings(): Promise<void> {
  await AsyncStorage.removeItem(RATING_HISTORY_KEY);
}

// Saves a platform username to AsyncStorage.
export async function saveUsername(
  platform: string,
  username: string
): Promise<void> {
  await AsyncStorage.setItem(getUsernameKey(platform), username.trim());
}

// Retrieves a platform username from AsyncStorage.
export async function getUsername(platform: string): Promise<string | null> {
  return AsyncStorage.getItem(getUsernameKey(platform));
}

// Saves all game history entries to AsyncStorage.
export async function saveGames(games: GameEntry[]): Promise<void> {
  await AsyncStorage.setItem(GAME_HISTORY_KEY, JSON.stringify(games));
}

// Returns game history sorted by date, newest first.
export async function getGames(): Promise<GameEntry[]> {
  const rawValue = await AsyncStorage.getItem(GAME_HISTORY_KEY);
  if (!rawValue) {
    return [];
  }

  try {
    const parsed = JSON.parse(rawValue) as GameEntry[];
    if (!Array.isArray(parsed)) {
      return [];
    }

    return [...parsed].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
  } catch {
    return [];
  }
}

// Saves one journal entry to AsyncStorage by appending to existing entries.
export async function saveJournalEntry(entry: JournalEntry): Promise<void> {
  const existingEntries = await getJournalEntries();
  const updatedEntries = [...existingEntries, entry];
  await AsyncStorage.setItem(JOURNAL_ENTRIES_KEY, JSON.stringify(updatedEntries));
}

// Returns all journal entries sorted newest first.
export async function getJournalEntries(): Promise<JournalEntry[]> {
  const rawValue = await AsyncStorage.getItem(JOURNAL_ENTRIES_KEY);
  if (!rawValue) {
    return [];
  }

  try {
    const parsed = JSON.parse(rawValue) as JournalEntry[];
    if (!Array.isArray(parsed)) {
      return [];
    }

    return [...parsed].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  } catch {
    return [];
  }
}

// Deletes a journal entry with a matching id.
export async function deleteJournalEntry(id: string): Promise<void> {
  const existingEntries = await getJournalEntries();
  const updatedEntries = existingEntries.filter((entry) => entry.id !== id);
  await AsyncStorage.setItem(JOURNAL_ENTRIES_KEY, JSON.stringify(updatedEntries));
}

// Human-readable labels for each game tag.
export const TAG_LABELS: Record<GameTag, string> = {
  'time-pressure': 'Time Pressure',
  'opening-mistake': 'Opening Mistake',
  'endgame-mistake': 'Endgame Mistake',
  'tactical-miss': 'Missed Tactic',
  'overconfident': 'Overconfidence',
  'calculation-error': 'Calculation Error',
  'positional-error': 'Positional Error',
  'other': 'Other',
};

// All tag values in display order.
export const ALL_TAGS: GameTag[] = [
  'time-pressure',
  'opening-mistake',
  'endgame-mistake',
  'tactical-miss',
  'overconfident',
  'calculation-error',
  'positional-error',
  'other',
];

// Updates a game's tags, reflection, and reviewed flag in stored game history.
export async function tagGame(
  gameId: string,
  tags: GameTag[],
  reflection: string
): Promise<void> {
  const rawValue = await AsyncStorage.getItem(GAME_HISTORY_KEY);
  let games: GameEntry[] = [];
  if (rawValue) {
    try {
      const parsed = JSON.parse(rawValue) as GameEntry[];
      games = Array.isArray(parsed) ? parsed : [];
    } catch {
      games = [];
    }
  }
  const updated = games.map((game) => {
    if (game.id !== gameId) return game;
    return { ...game, tags, reflection: reflection.trim(), reviewed: true };
  });
  await AsyncStorage.setItem(GAME_HISTORY_KEY, JSON.stringify(updated));
}

// Returns aggregated tag counts across all reviewed games, sorted by frequency.
export async function getTagSummary(): Promise<TagSummary> {
  const games = await getGames();
  const taggedGames = games.filter((g) => g.reviewed && g.tags && g.tags.length > 0);
  const counts = new Map<GameTag, number>();
  for (const game of taggedGames) {
    for (const tag of game.tags ?? []) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  const tags = ALL_TAGS
    .map((tag) => ({ tag, count: counts.get(tag) ?? 0, label: TAG_LABELS[tag] }))
    .filter((t) => t.count > 0)
    .sort((a, b) => b.count - a.count);
  return { totalTagged: taggedGames.length, tags };
}

const PUZZLE_PROGRESS_KEY = 'puzzle_progress';

export type PuzzleStats = { solved: number; xp: number; level: number };

// XP per level. Level is derived from total XP.
export const XP_PER_LEVEL = 100;

function levelForXp(xp: number): number {
  return Math.floor(xp / XP_PER_LEVEL) + 1;
}

// Returns the player's puzzle-path progress.
export async function getPuzzleStats(): Promise<PuzzleStats> {
  try {
    const raw = await AsyncStorage.getItem(PUZZLE_PROGRESS_KEY);
    const parsed = raw ? (JSON.parse(raw) as { solved?: number; xp?: number }) : {};
    const solved = typeof parsed.solved === 'number' ? parsed.solved : 0;
    const xp = typeof parsed.xp === 'number' ? parsed.xp : 0;
    return { solved, xp, level: levelForXp(xp) };
  } catch {
    return { solved: 0, xp: 0, level: 1 };
  }
}

// Records a solved puzzle, adds XP, and returns the updated stats.
export async function addPuzzleSolved(points: number): Promise<PuzzleStats> {
  const current = await getPuzzleStats();
  const next = { solved: current.solved + 1, xp: current.xp + Math.max(0, points) };
  await AsyncStorage.setItem(PUZZLE_PROGRESS_KEY, JSON.stringify(next));
  return { ...next, level: levelForXp(next.xp) };
}
