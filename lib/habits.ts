import type { MoveJudgement } from './engine';
import type { GameAnalysisRecord, MistakeCategory } from './storage';

export const CATEGORY_LABELS: Record<MistakeCategory, string> = {
  opening: 'Opening mistakes',
  middlegame: 'Middlegame mistakes',
  endgame: 'Endgame mistakes',
  'missed-mate': 'Missed checkmates',
};

export const ALL_CATEGORIES: MistakeCategory[] = [
  'opening',
  'middlegame',
  'endgame',
  'missed-mate',
];

// Buckets the user's engine-confirmed mistakes into habit categories.
// Inaccuracies are ignored for phase habits — habits track real mistakes.
export function categorizeMistakes(
  judgements: MoveJudgement[],
  userColor: 'w' | 'b'
): Record<MistakeCategory, number> {
  const counts: Record<MistakeCategory, number> = {
    opening: 0,
    middlegame: 0,
    endgame: 0,
    'missed-mate': 0,
  };
  for (const j of judgements) {
    if (j.color !== userColor || j.classification === 'good') continue;
    if (j.bestSan?.includes('#')) counts['missed-mate'] += 1;
    if (j.classification === 'inaccuracy') continue;
    if (j.ply <= 20) counts.opening += 1;
    else if (j.ply <= 40) counts.middlegame += 1;
    else counts.endgame += 1;
  }
  return counts;
}

export type HabitInsight = {
  kind: 'repeated' | 'returned' | 'broken';
  category: MistakeCategory;
  label: string;
  runLength: number; // for 'repeated': consecutive games including this one
};

export type HabitReport = {
  isBaseline: boolean;
  insights: HabitInsight[];
};

// Compares the current game's fingerprint against prior analyzed games.
export function compareToHistory(
  records: GameAnalysisRecord[], // ascending by date
  currentGameId: string
): HabitReport {
  const idx = records.findIndex((r) => r.gameId === currentGameId);
  if (idx === -1) return { isBaseline: records.length === 0, insights: [] };
  const current = records[idx];
  const prior = records.slice(0, idx);
  if (prior.length === 0) return { isBaseline: true, insights: [] };

  const insights: HabitInsight[] = [];
  for (const c of ALL_CATEGORIES) {
    const label = CATEGORY_LABELS[c];
    const now = (current.categories?.[c] ?? 0) > 0;
    const prev = (prior[prior.length - 1].categories?.[c] ?? 0) > 0;
    const ever = prior.some((r) => (r.categories?.[c] ?? 0) > 0);

    if (now && prev) {
      let run = 1;
      for (let i = prior.length - 1; i >= 0; i -= 1) {
        if ((prior[i].categories?.[c] ?? 0) > 0) run += 1;
        else break;
      }
      insights.push({ kind: 'repeated', category: c, label, runLength: run });
    } else if (now && ever) {
      insights.push({ kind: 'returned', category: c, label, runLength: 1 });
    } else if (!now && prev) {
      insights.push({ kind: 'broken', category: c, label, runLength: 1 });
    }
  }

  const order = { broken: 0, repeated: 1, returned: 2 } as const;
  insights.sort((a, b) => order[a.kind] - order[b.kind]);
  return { isBaseline: false, insights };
}

export type HabitStreak = {
  category: MistakeCategory;
  label: string;
  cleanStreak: number; // consecutive most-recent analyzed games without it
  recentCount: number; // games (of last 10 analyzed) where it appeared
};

// Builds per-habit clean streaks for categories the player has ever shown.
export function buildHabitStreaks(records: GameAnalysisRecord[]): HabitStreak[] {
  if (records.length === 0) return [];
  const recent = records.slice(-10);
  const out: HabitStreak[] = [];
  for (const c of ALL_CATEGORIES) {
    const everSeen = records.some((r) => (r.categories?.[c] ?? 0) > 0);
    if (!everSeen) continue;
    let clean = 0;
    for (let i = records.length - 1; i >= 0; i -= 1) {
      if ((records[i].categories?.[c] ?? 0) > 0) break;
      clean += 1;
    }
    const recentCount = recent.reduce(
      (sum, r) => sum + ((r.categories?.[c] ?? 0) > 0 ? 1 : 0),
      0
    );
    out.push({ category: c, label: CATEGORY_LABELS[c], cleanStreak: clean, recentCount });
  }
  // Most problematic first: most recurrences, then shortest clean streak.
  out.sort((a, b) => b.recentCount - a.recentCount || a.cleanStreak - b.cleanStreak);
  return out;
}

// 2 -> "2nd", 3 -> "3rd", 11 -> "11th" ...
export function ordinal(n: number): string {
  if (n % 100 >= 11 && n % 100 <= 13) return `${n}th`;
  if (n % 10 === 1) return `${n}st`;
  if (n % 10 === 2) return `${n}nd`;
  if (n % 10 === 3) return `${n}rd`;
  return `${n}th`;
}
