import { Chess } from 'chess.js';
import { evaluateFen } from './engine';

export type BotMove = { from: string; to: string; promotion?: string };

// How the bot plays at a given strength: engine depth + a human-like chance
// of playing a random (imperfect) move instead of the best one.
export type BotProfile = {
  approxRating: number;
  depth: number;
  blunderChance: number;
};

// Maps a target rating to a playable strength profile.
export function profileForRating(rating: number): BotProfile {
  const r = Math.max(400, Math.min(2400, Math.round(rating)));
  if (r < 800) return { approxRating: r, depth: 1, blunderChance: 0.28 };
  if (r < 1100) return { approxRating: r, depth: 2, blunderChance: 0.18 };
  if (r < 1400) return { approxRating: r, depth: 4, blunderChance: 0.1 };
  if (r < 1700) return { approxRating: r, depth: 6, blunderChance: 0.05 };
  if (r < 2000) return { approxRating: r, depth: 9, blunderChance: 0.02 };
  return { approxRating: r, depth: 12, blunderChance: 0 };
}

// Picks a random legal move — the bot's "human error", and the offline fallback.
function randomLegalMove(fen: string): BotMove | null {
  try {
    const chess = new Chess(fen);
    const moves = chess.moves({ verbose: true });
    if (moves.length === 0) return null;
    const m = moves[Math.floor(Math.random() * moves.length)];
    return { from: m.from, to: m.to, promotion: m.promotion };
  } catch {
    return null;
  }
}

// Returns the bot's move for a position, at the profile's strength.
export async function getBotMove(fen: string, profile: BotProfile): Promise<BotMove | null> {
  if (Math.random() < profile.blunderChance) {
    const slip = randomLegalMove(fen);
    if (slip) return slip;
  }
  const evalResult = await evaluateFen(fen, profile.depth);
  const uci = evalResult?.bestUci;
  if (uci && uci.length >= 4) {
    return {
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      promotion: uci.slice(4, 5) || undefined,
    };
  }
  return randomLegalMove(fen);
}
