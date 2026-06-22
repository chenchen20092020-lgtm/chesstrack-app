// Engine analysis via a hosted Stockfish API (chess-api.com). Works inside
// Expo Go with plain fetch — no native modules. Evaluations are returned from
// White's point of view, in centipawns.

const ENGINE_URL = 'https://chess-api.com/v1';
const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const EVAL_CLAMP = 2000; // ±20 pawns — beyond this the position is simply decided

export type EngineEval = {
  evalCp: number; // centipawns, White POV (positive = White better)
  mate: number | null;
  bestSan: string | null; // engine's best move at this position, in SAN
};

export type Classification = 'blunder' | 'mistake' | 'inaccuracy' | 'good';

export type MoveJudgement = {
  ply: number; // 1-based half-move
  moveNumber: number; // full-move number
  color: 'w' | 'b';
  san: string; // the move actually played
  cpl: number; // centipawns lost vs the engine's best (>= 0)
  classification: Classification;
  bestSan: string | null; // what should have been played
  evalBeforeWhite: number; // White-POV centipawns before the move
  evalAfterWhite: number; // White-POV centipawns after the move
};

export type GameAnalysis = {
  judgements: MoveJudgement[];
};

type RawEngineResponse = {
  eval?: number;
  mate?: number | null;
  san?: string;
  move?: string;
  type?: string;
};

function sideToMove(fen: string): 'w' | 'b' {
  return fen.split(' ')[1] === 'b' ? 'b' : 'w';
}

// Evaluates a single FEN. Returns null on failure so callers can degrade.
export async function evaluateFen(fen: string, depth = 12): Promise<EngineEval | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    const res = await fetch(ENGINE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fen, depth }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) return null;

    const data = (await res.json()) as RawEngineResponse;

    let evalCp: number;
    if (typeof data.eval === 'number') {
      evalCp = Math.round(data.eval * 100);
    } else if (data.mate != null && data.mate !== 0) {
      // Convert "mate in N" to a large White-POV score.
      const dir = (sideToMove(fen) === 'w' ? 1 : -1) * Math.sign(data.mate);
      evalCp = dir * EVAL_CLAMP;
    } else {
      return null;
    }

    evalCp = Math.max(-EVAL_CLAMP, Math.min(EVAL_CLAMP, evalCp));
    return { evalCp, mate: data.mate ?? null, bestSan: data.san ?? null };
  } catch {
    return null;
  }
}

// Runs an async mapper over items with a bounded concurrency pool.
async function mapPool<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
  onDone?: () => void
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  async function worker(): Promise<void> {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await fn(items[index], index);
      onDone?.();
    }
  }
  const workers = Array.from({ length: Math.min(limit, items.length) }, worker);
  await Promise.all(workers);
  return results;
}

function classify(cpl: number): Classification {
  if (cpl >= 300) return 'blunder';
  if (cpl >= 150) return 'mistake';
  if (cpl >= 80) return 'inaccuracy';
  return 'good';
}

export type AnalyzeOptions = {
  depth?: number;
  maxPlies?: number;
  concurrency?: number;
  onProgress?: (done: number, total: number) => void;
};

// Evaluates every position in a game and judges each move by centipawn loss.
// Returns null if too many engine calls fail.
export async function analyzeGame(
  moves: { move: string; fen: string }[],
  options: AnalyzeOptions = {}
): Promise<GameAnalysis | null> {
  const maxPlies = options.maxPlies ?? 90;
  const plies = Math.min(moves.length, maxPlies);
  if (plies === 0) return { judgements: [] };

  const fens = [START_FEN, ...moves.slice(0, plies).map((m) => m.fen)];
  let done = 0;
  const evals = await mapPool(
    fens,
    options.concurrency ?? 4,
    (fen) => evaluateFen(fen, options.depth ?? 12),
    () => {
      done += 1;
      options.onProgress?.(done, fens.length);
    }
  );

  const okCount = evals.filter(Boolean).length;
  if (okCount < fens.length * 0.6) return null; // engine mostly failed

  const judgements: MoveJudgement[] = [];
  for (let i = 1; i <= plies; i += 1) {
    const before = evals[i - 1];
    const after = evals[i];
    if (!before || !after) continue;

    const mover: 'w' | 'b' = i % 2 === 1 ? 'w' : 'b';
    const beforeMover = mover === 'w' ? before.evalCp : -before.evalCp;
    const afterMover = mover === 'w' ? after.evalCp : -after.evalCp;
    const cpl = Math.max(0, beforeMover - afterMover);

    judgements.push({
      ply: i,
      moveNumber: Math.ceil(i / 2),
      color: mover,
      san: moves[i - 1].move,
      cpl,
      classification: classify(cpl),
      bestSan: before.bestSan,
      evalBeforeWhite: before.evalCp,
      evalAfterWhite: after.evalCp,
    });
  }

  return { judgements };
}

// Estimates an accuracy percentage from a player's average centipawn loss.
export function estimateAccuracy(judgements: MoveJudgement[], color: 'w' | 'b'): number | null {
  const own = judgements.filter((j) => j.color === color);
  if (own.length === 0) return null;
  const avgCpl = own.reduce((sum, j) => sum + j.cpl, 0) / own.length;
  const acc = 100 * Math.exp(-avgCpl / 200);
  return Math.max(0, Math.min(100, Math.round(acc)));
}

const NAME: Record<Classification, string> = {
  blunder: 'Blunder',
  mistake: 'Mistake',
  inaccuracy: 'Inaccuracy',
  good: 'Good',
};

const MARK: Record<Classification, string> = {
  blunder: '??',
  mistake: '?',
  inaccuracy: '?!',
  good: '',
};

// Builds a direct, plain-language sentence about a single mistake.
export function describeMistake(j: MoveJudgement, userColor: 'w' | 'b'): string {
  const number = j.color === 'w' ? `${j.moveNumber}.` : `${j.moveNumber}...`;
  const userBefore = userColor === 'w' ? j.evalBeforeWhite : -j.evalBeforeWhite;
  const userAfter = userColor === 'w' ? j.evalAfterWhite : -j.evalAfterWhite;
  const fmt = (cp: number) => `${cp >= 0 ? '+' : ''}${(cp / 100).toFixed(1)}`;
  const better =
    j.bestSan && j.bestSan !== j.san ? ` Better was ${j.bestSan}.` : '';
  return `${number} ${j.san}${MARK[j.classification]} — ${NAME[j.classification]}. You went from ${fmt(userBefore)} to ${fmt(userAfter)}.${better}`;
}
