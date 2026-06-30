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

// Fetches a single puzzle from Lichess (no auth required) and converts the game
// PGN + initialPly into the puzzle's starting position.
export async function fetchLichessPuzzle(opts?: {
  angle?: string;
  difficulty?: string;
}): Promise<LichessPuzzle | null> {
  try {
    const query: string[] = [];
    if (opts?.angle) query.push(`angle=${encodeURIComponent(opts.angle)}`);
    if (opts?.difficulty) query.push(`difficulty=${encodeURIComponent(opts.difficulty)}`);
    const url = `https://lichess.org/api/puzzle/next${query.length ? `?${query.join('&')}` : ''}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) return null;

    const data = (await res.json()) as {
      game?: { pgn?: string };
      puzzle?: { id?: string; solution?: string[]; initialPly?: number; rating?: number; themes?: string[] };
    };

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
