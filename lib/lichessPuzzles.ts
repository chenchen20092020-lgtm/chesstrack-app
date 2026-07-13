import { Chess } from 'chess.js';

// A Lichess puzzle, normalized for the trainer. The solver plays the even
// indices of `solution` (0, 2, 4 …); odd indices are the opponent's replies.
export type LichessPuzzle = {
  id: string;
  fen: string; // starting position, solver to move
  solution: string[]; // UCI moves
  rating: number;
  themes: string[];
};

const RESULT_TOKENS = new Set(['1-0', '0-1', '1/2-1/2', '*']);

type PuzzlePayload = {
  game?: { pgn?: string };
  puzzle?: { id?: string; solution?: string[]; initialPly?: number; rating?: number; themes?: string[] };
};

// Converts a Lichess puzzle payload (game PGN + initialPly) into a start FEN.
function parsePuzzlePayload(data: PuzzlePayload): LichessPuzzle | null {
  try {
    const pgn = data.game?.pgn;
    const solution = data.puzzle?.solution;
    const initialPly = data.puzzle?.initialPly;
    if (typeof pgn !== 'string' || !Array.isArray(solution) || typeof initialPly !== 'number') {
      return null;
    }

    // Replay the game up to the puzzle's starting position.
    const replay = new Chess();
    const tokens = pgn
      .trim()
      .split(/\s+/)
      .filter((t) => t && !RESULT_TOKENS.has(t) && !/^\d+\.+$/.test(t));
    // The puzzle position is reached after the move at `initialPly` is played
    // (so initialPly + 1 half-moves); the solver then plays solution[0].
    for (let i = 0; i < Math.min(initialPly + 1, tokens.length); i += 1) {
      replay.move(tokens[i]); // throws on illegal move -> caught below
    }

    return {
      id: data.puzzle?.id ?? `${Date.now()}`,
      fen: replay.fen(),
      solution,
      rating: data.puzzle?.rating ?? 0,
      themes: data.puzzle?.themes ?? [],
    };
  } catch {
    return null;
  }
}

// Fetches one Lichess API url and parses it into a puzzle.
async function fetchPuzzleFromUrl(url: string): Promise<LichessPuzzle | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const data = (await res.json()) as PuzzlePayload;
    return parsePuzzlePayload(data);
  } catch {
    return null;
  }
}

// Fetches a single puzzle from Lichess (no auth required).
export async function fetchLichessPuzzle(opts?: {
  angle?: string;
  difficulty?: string;
}): Promise<LichessPuzzle | null> {
  const query: string[] = [];
  if (opts?.angle) query.push(`angle=${encodeURIComponent(opts.angle)}`);
  if (opts?.difficulty) query.push(`difficulty=${encodeURIComponent(opts.difficulty)}`);
  return fetchPuzzleFromUrl(
    `https://lichess.org/api/puzzle/next${query.length ? `?${query.join('&')}` : ''}`
  );
}

// Fetches today's official Lichess daily puzzle (same one for everyone).
export async function fetchDailyPuzzle(): Promise<LichessPuzzle | null> {
  return fetchPuzzleFromUrl('https://lichess.org/api/puzzle/daily');
}
