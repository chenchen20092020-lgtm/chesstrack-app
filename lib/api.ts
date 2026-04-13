import { GameEntry, GameResult } from '@/lib/storage';
import { Chess } from 'chess.js';

export type GameReviewMove = {
  move: string;
  fen: string;
};

export type GameReviewFlag = {
  moveIndex: number;
  type: string;
  label: string;
};

export type GameReview = {
  white: string;
  black: string;
  result: string;
  date: string;
  timeControl: string;
  whiteElo: number;
  blackElo: number;
  moves: GameReviewMove[];
  flags: GameReviewFlag[];
  insights: string[];
  recommendation: string;
};

// Maps Chess.com result text to app-level game result.
function mapChessComResult(result: string): GameResult {
  if (result === 'win') {
    return 'win';
  }

  const drawResults = new Set([
    'agreed',
    'repetition',
    'stalemate',
    'insufficient',
    '50move',
    'timevsinsufficient',
  ]);

  if (drawResults.has(result)) {
    return 'draw';
  }

  return 'loss';
}

// Extracts PGN headers into a key-value map.
function parsePgnHeaders(pgn: string): Record<string, string> {
  const headers: Record<string, string> = {};
  const regex = /\[(\w+)\s+"([^"]*)"\]/g;
  let match: RegExpExecArray | null = regex.exec(pgn);

  while (match) {
    headers[match[1]] = match[2];
    match = regex.exec(pgn);
  }

  return headers;
}

// Returns year/month pairs for the last 3 months (current + 2 prior).
function getRecentYearMonths(): { year: number; month: string }[] {
  const now = new Date();
  const months = [];
  for (let i = 0; i < 3; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({
      year: d.getFullYear(),
      month: String(d.getMonth() + 1).padStart(2, '0'),
    });
  }
  return months;
}

// Fetches a Chess.com rapid/blitz rating for a username.
export async function fetchChessComRating(
  username: string
): Promise<number | null> {
  try {
    const response = await fetch(
      `https://api.chess.com/pub/player/${encodeURIComponent(username)}/stats`
    );
    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    const rapidRating = data?.chess_rapid?.last?.rating;
    const blitzRating = data?.chess_blitz?.last?.rating;
    const rating = rapidRating ?? blitzRating;

    return typeof rating === 'number' ? rating : null;
  } catch {
    return null;
  }
}

// Fetches a Lichess rapid/blitz rating for a username.
export async function fetchLichessRating(
  username: string
): Promise<number | null> {
  try {
    const response = await fetch(
      `https://lichess.org/api/user/${encodeURIComponent(username)}`
    );
    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    const rapidRating = data?.perfs?.rapid?.rating;
    const blitzRating = data?.perfs?.blitz?.rating;
    const rating = rapidRating ?? blitzRating;

    return typeof rating === 'number' ? rating : null;
  } catch {
    return null;
  }
}

// Fetches and transforms Chess.com games for the current and previous month.
export async function fetchChessComGames(username: string): Promise<GameEntry[]> {
  try {
    const yearMonths = getRecentYearMonths();
    const allGames: any[] = [];

    for (const { year, month } of yearMonths) {
      try {
        const response = await fetch(
          `https://api.chess.com/pub/player/${encodeURIComponent(username)}/games/${year}/${month}`
        );
        if (!response.ok) continue;
        const data = await response.json();
        if (Array.isArray(data?.games)) {
          allGames.push(...data.games);
        }
      } catch {
        // skip failed month
      }
    }

    const games = allGames;
    const normalizedUsername = username.toLowerCase();

    return games.map((game: any, index: number): GameEntry => {
      const whiteUsername = game?.white?.username ?? '';
      const blackUsername = game?.black?.username ?? '';
      const iAmWhite = whiteUsername.toLowerCase() === normalizedUsername;
      const mySide = iAmWhite ? game?.white : game?.black;
      const opponentSide = iAmWhite ? game?.black : game?.white;
      const pgnHeaders =
        typeof game?.pgn === 'string' ? parsePgnHeaders(game.pgn) : {};

      const epochSeconds =
        typeof game?.end_time === 'number' ? game.end_time * 1000 : Date.now();
      const dateIso = new Date(epochSeconds).toISOString();
      const resultText = String(mySide?.result ?? '').toLowerCase();
      const result = mapChessComResult(resultText);
      const ratingValue =
        typeof mySide?.rating === 'number'
          ? mySide.rating
          : Number.parseInt(pgnHeaders.WhiteElo ?? pgnHeaders.BlackElo ?? '0', 10) || 0;
      const timeControl =
        pgnHeaders.TimeControl ?? game?.time_control ?? game?.time_class ?? '-';

      return {
        id: `chesscom-${game?.uuid ?? index}`,
        date: dateIso,
        opponent: opponentSide?.username ?? 'Unknown',
        result,
        myRating: ratingValue,
        platform: 'Chess.com',
        timeControl,
        pgn: typeof game?.pgn === 'string' ? game.pgn : undefined,
      };
    });
  } catch {
    return [];
  }
}

// Fetches and transforms recent rated Lichess games for a username.
export async function fetchLichessGames(username: string): Promise<GameEntry[]> {
  try {
    const response = await fetch(
      `https://lichess.org/api/games/user/${encodeURIComponent(
        username
      )}?max=20&rated=true`,
      {
        headers: {
          Accept: 'application/x-ndjson',
        },
      }
    );
    if (!response.ok) {
      return [];
    }

    const rawText = await response.text();
    const lines = rawText
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    const normalizedUsername = username.toLowerCase();

    return lines
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter((game) => game !== null)
      .map((game: any): GameEntry => {
        const whiteUser = game?.players?.white?.user?.name ?? 'Unknown';
        const blackUser = game?.players?.black?.user?.name ?? 'Unknown';
        const iAmWhite = whiteUser.toLowerCase() === normalizedUsername;
        const myPlayer = iAmWhite ? game?.players?.white : game?.players?.black;
        const opponentPlayer = iAmWhite ? game?.players?.black : game?.players?.white;
        const opponentName = opponentPlayer?.user?.name ?? 'Unknown';

        let result: GameResult = 'draw';
        if (game?.winner === 'white') {
          result = iAmWhite ? 'win' : 'loss';
        } else if (game?.winner === 'black') {
          result = iAmWhite ? 'loss' : 'win';
        }

        const createdAt = typeof game?.createdAt === 'number' ? game.createdAt : Date.now();
        const timeControl = game?.clock?.initial
          ? `${Math.round(game.clock.initial / 60)}+${Math.round(
              (game.clock.increment ?? 0) / 1
            )}`
          : game?.speed ?? '-';

        return {
          id: `lichess-${game?.id ?? `${createdAt}`}`,
          date: new Date(createdAt).toISOString(),
          opponent: opponentName,
          result,
          myRating: typeof myPlayer?.rating === 'number' ? myPlayer.rating : 0,
          platform: 'Lichess',
          timeControl,
        };
      });
  } catch {
    return [];
  }
}

// Extracts a clean Lichess game id from a mixed id or URL.
function extractLichessGameId(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  const noPrefix = trimmed.replace(/^lichess-/, '');
  if (/^https?:\/\//i.test(noPrefix)) {
    const parts = noPrefix.split('/').filter(Boolean);
    return parts[parts.length - 1]?.split('?')[0] ?? '';
  }
  return noPrefix.split('?')[0];
}

// Converts a clock token (h:mm:ss or m:ss) into total seconds.
function clockToSeconds(clock: string): number {
  const parts = clock.split(':').map((p) => Number.parseInt(p, 10));
  if (parts.some((p) => Number.isNaN(p))) return Number.NaN;
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  return Number.NaN;
}

// Parses PGN headers into strong defaults for review metadata.
function parseReviewHeaders(pgn: string): {
  white: string;
  black: string;
  result: string;
  date: string;
  timeControl: string;
  whiteElo: number;
  blackElo: number;
} {
  const headers = parsePgnHeaders(pgn);
  return {
    white: headers.White ?? 'White',
    black: headers.Black ?? 'Black',
    result: headers.Result ?? '*',
    date: headers.Date ?? 'Unknown',
    timeControl: headers.TimeControl ?? '-',
    whiteElo: Number.parseInt(headers.WhiteElo ?? '0', 10) || 0,
    blackElo: Number.parseInt(headers.BlackElo ?? '0', 10) || 0,
  };
}

// Returns SAN move tokens by stripping tags, comments, and annotations.
function extractSanMovesFromPgn(pgn: string): string[] {
  const body = pgn
    .replace(/\[[^\]]*\]\s*/g, ' ')
    .replace(/\{[^}]*\}/g, ' ')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\$\d+/g, ' ')
    .replace(/\d+\.(\.\.)?/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return body
    .split(' ')
    .filter(
      (token) =>
        token &&
        token !== '1-0' &&
        token !== '0-1' &&
        token !== '1/2-1/2' &&
        token !== '*'
    );
}

// Extracts all clock annotations in move order.
function extractClockSequence(pgn: string): number[] {
  const values: number[] = [];
  const regex = /\[%clk\s+([0-9:]+)\]/g;
  let match: RegExpExecArray | null = regex.exec(pgn);
  while (match) {
    const seconds = clockToSeconds(match[1]);
    values.push(Number.isNaN(seconds) ? -1 : seconds);
    match = regex.exec(pgn);
  }
  return values;
}

// Calculates material score from a FEN board field.
function materialFromFen(fen: string): { white: number; black: number } {
  const board = fen.split(' ')[0];
  const values: Record<string, number> = {
    p: 1,
    n: 3,
    b: 3,
    r: 5,
    q: 9,
    k: 0,
  };
  let white = 0;
  let black = 0;
  for (const ch of board) {
    if (ch === '/' || /\d/.test(ch)) continue;
    const v = values[ch.toLowerCase()] ?? 0;
    if (ch === ch.toUpperCase()) white += v;
    else black += v;
  }
  return { white, black };
}

// Builds move+FEN sequence and rich data from PGN.
function parsePgnToReviewData(pgn: string): {
  moves: GameReviewMove[];
  verboseMoves: ReturnType<Chess['history']> extends (infer T)[] ? T[] : never[];
  clockValues: number[];
} | null {
  try {
    const game = new Chess();
    game.loadPgn(pgn);
    const sanMoves = game.history();
    const verboseMoves = game.history({ verbose: true }) as any[];

    const replay = new Chess();
    const moves: GameReviewMove[] = [];
    for (const san of sanMoves) {
      const played = replay.move(san);
      if (!played) return null;
      moves.push({ move: san, fen: replay.fen() });
    }
    const clockValues = extractClockSequence(pgn);
    return { moves, verboseMoves: verboseMoves as never[], clockValues };
  } catch {
    return null;
  }
}

// Determines the game phase by move count.
function getGamePhase(totalMoves: number): 'opening' | 'middlegame' | 'endgame' {
  if (totalMoves < 20) return 'opening';
  if (totalMoves <= 40) return 'middlegame';
  return 'endgame';
}

// Detects whether the losing side failed to castle in time.
function isKingUncastledByMove15(verboseMoves: any[], losingColor: 'w' | 'b' | null): boolean {
  if (!losingColor) return false;
  const limit = Math.min(verboseMoves.length, 30);
  for (let i = 0; i < limit; i += 1) {
    const m = verboseMoves[i];
    if (m.color !== losingColor) continue;
    if (m.flags?.includes('k') || m.flags?.includes('q')) {
      return false;
    }
  }
  return true;
}

// Detects repeated same-piece movement (3+) in first 10 plies.
function hasDevelopmentIssue(verboseMoves: any[], losingColor: 'w' | 'b' | null): boolean {
  if (!losingColor) return false;
  const tracker: Record<string, number> = {};
  const limit = Math.min(verboseMoves.length, 10);
  for (let i = 0; i < limit; i += 1) {
    const m = verboseMoves[i];
    if (m.color !== losingColor) continue;
    const key = `${m.piece}:${m.from}`;
    tracker[key] = (tracker[key] ?? 0) + 1;
    if (tracker[key] >= 3) return true;
  }
  return false;
}

// Derives loser perspective from game result.
function getLosingColor(result: string): 'w' | 'b' | null {
  if (result === '0-1') return 'w';
  if (result === '1-0') return 'b';
  return null;
}

// Builds review flags, insights, and recommendation from parsed game data.
function buildReviewAnnotations(
  result: string,
  moves: GameReviewMove[],
  verboseMoves: any[],
  clockValues: number[],
  userResult: GameResult = 'loss'
): { flags: GameReviewFlag[]; insights: string[]; recommendation: string } {
  const flags: GameReviewFlag[] = [];
  const totalMoves = moves.length;
  const losingColor = getLosingColor(result);
  const gameLost = losingColor !== null;
  const phase = getGamePhase(totalMoves);

  if (gameLost && totalMoves < 25) {
    flags.push({
      moveIndex: Math.min(9, Math.max(totalMoves - 1, 0)),
      type: 'opening',
      label: 'Opening Issue',
    });
  }

  const lowClockIndices = clockValues
    .map((seconds, i) => ({ seconds, i }))
    .filter((c) => c.seconds >= 0 && c.seconds <= 30)
    .map((c) => c.i);

  if (lowClockIndices.length > 0 && moves.length > 0) {
    const fenSeq = ['start', ...moves.map((m) => m.fen)];
    let flagged = false;
    for (const idx of lowClockIndices) {
      const moveIdx = Math.min(idx, moves.length - 1);
      const prev = moveIdx === 0 ? materialFromFen(new Chess().fen()) : materialFromFen(fenSeq[moveIdx]);
      const next = materialFromFen(fenSeq[moveIdx + 1]);
      const movedColor = moveIdx % 2 === 0 ? 'w' : 'b';
      const lostMaterial =
        movedColor === 'w' ? next.white < prev.white : next.black < prev.black;
      if (lostMaterial) {
        flags.push({
          moveIndex: moveIdx,
          type: 'time',
          label: 'Time Pressure Mistake',
        });
        flagged = true;
        break;
      }
    }
    if (!flagged && lowClockIndices.length > 0) {
      flags.push({
        moveIndex: Math.min(lowClockIndices[0], moves.length - 1),
        type: 'time',
        label: 'Time Pressure Mistake',
      });
    }
  }

  if (hasDevelopmentIssue(verboseMoves, losingColor)) {
    flags.push({
      moveIndex: Math.min(9, Math.max(totalMoves - 1, 0)),
      type: 'development',
      label: 'Development Issue',
    });
  }

  if (gameLost && isKingUncastledByMove15(verboseMoves, losingColor)) {
    flags.push({
      moveIndex: Math.min(14, Math.max(totalMoves - 1, 0)),
      type: 'king',
      label: 'King Safety Issue',
    });
  }

  if (gameLost && totalMoves > 0) {
    for (let i = Math.max(totalMoves - 3, 0); i < totalMoves; i += 1) {
      flags.push({
        moveIndex: i,
        type: 'finish',
        label: 'Endgame/Finish',
      });
    }
  }

  const uniqueFlags = flags.filter(
    (f, idx) =>
      flags.findIndex((x) => x.moveIndex === f.moveIndex && x.type === f.type) === idx
  );

  const insights: string[] = [];
  if (userResult === 'win') {
    insights.push(`You won in ${totalMoves} moves`);
  } else if (userResult === 'loss') {
    insights.push(`You lost in ${totalMoves} moves — this was decided early`);
  } else {
    insights.push(`This game ended in a draw after ${totalMoves} moves`);
  }
  insights.push(`The game went to ${phase}`);
  if (losingColor === 'w') insights.push('You were playing as White');
  else if (losingColor === 'b') insights.push('You were playing as Black');
  if (uniqueFlags.some((f) => f.type === 'time')) {
    insights.push('You made mistakes when your clock was running low');
  }
  if (uniqueFlags.some((f) => f.type === 'development')) {
    insights.push('You moved the same piece multiple times in the opening');
  }
  if (uniqueFlags.some((f) => f.type === 'king')) {
    insights.push('Your king was not safe — castling early is important');
  }

  let recommendation =
    'Review this game move by move and find the moment the position turned against you.';
  if (uniqueFlags.some((f) => f.type === 'opening')) {
    recommendation =
      'Study the opening you played. Learn the first 10 moves of your main repertoire.';
  } else if (uniqueFlags.some((f) => f.type === 'time')) {
    recommendation =
      'Practice faster time controls to improve your speed. Try 3+2 blitz games.';
  } else if (uniqueFlags.some((f) => f.type === 'development')) {
    recommendation =
      'Review opening principles: develop each piece once before attacking.';
  } else if (uniqueFlags.some((f) => f.type === 'king')) {
    recommendation = 'Practice castling before move 10 in every game.';
  } else if (uniqueFlags.some((f) => f.type === 'finish')) {
    recommendation = 'Study basic endgame checkmates: K+Q vs K, K+R vs K.';
  }

  return { flags: uniqueFlags, insights, recommendation };
}

// Builds a complete GameReview object from a raw PGN string.
function buildGameReviewFromPgn(pgn: string, userResult: GameResult = 'loss'): GameReview | null {
  const metadata = parseReviewHeaders(pgn);
  const parsed = parsePgnToReviewData(pgn);
  if (!parsed) return null;
  const annotations = buildReviewAnnotations(
    metadata.result,
    parsed.moves,
    parsed.verboseMoves,
    parsed.clockValues,
    userResult
  );

  return {
    white: metadata.white,
    black: metadata.black,
    result: metadata.result,
    date: metadata.date,
    timeControl: metadata.timeControl,
    whiteElo: metadata.whiteElo,
    blackElo: metadata.blackElo,
    moves: parsed.moves,
    flags: annotations.flags,
    insights: annotations.insights,
    recommendation: annotations.recommendation,
  };
}

// Fetches one Chess.com game's PGN and returns full review data.
export async function fetchChessComGameMoves(
  pgn: string,
  userResult: GameResult = 'loss'
): Promise<GameReview | null> {
  try {
    const trimmedPgn = pgn.trim();
    console.log('[fetchChessComGameMoves] called with PGN length:', trimmedPgn.length);
    if (!trimmedPgn) {
      console.log('[fetchChessComGameMoves] returning null: empty PGN string');
      return null;
    }

    if (!trimmedPgn.includes('[Event') && !trimmedPgn.includes('[White')) {
      console.log('[fetchChessComGameMoves] returning null: provided string is not valid PGN');
      return null;
    }

    const review = buildGameReviewFromPgn(trimmedPgn, userResult);
    if (!review) {
      console.log('[fetchChessComGameMoves] returning null: buildGameReviewFromPgn failed');
      return null;
    }
    console.log('[fetchChessComGameMoves] review parsed successfully:', {
      white: review.white,
      black: review.black,
      result: review.result,
      moves: review.moves.length,
      flags: review.flags.length,
    });
    return review;
  } catch (error) {
    console.log('[fetchChessComGameMoves] caught error:', error);
    console.log('[fetchChessComGameMoves] returning null due to caught error');
    return null;
  }
}

// Fetches one Lichess game's PGN and returns full review data.
export async function fetchLichessGameMoves(
  gameId: string,
  userResult: GameResult = 'loss'
): Promise<GameReview | null> {
  try {
    const id = extractLichessGameId(gameId);
    console.log('[fetchLichessGameMoves] called with gameId:', gameId, 'extracted id:', id);
    if (!id) {
      console.log('[fetchLichessGameMoves] returning null: invalid/empty game id');
      return null;
    }

    const url = `https://lichess.org/game/export/${encodeURIComponent(id)}`;
    console.log('[fetchLichessGameMoves] calling URL:', url);
    const response = await fetch(url, {
      headers: {
        Accept: 'application/x-chess-pgn',
      },
    });
    console.log('[fetchLichessGameMoves] response status:', response.status, response.ok);
    if (!response.ok) {
      console.log('[fetchLichessGameMoves] returning null: response not ok');
      return null;
    }

    const pgn = await response.text();
    console.log('[fetchLichessGameMoves] raw PGN/text response:', pgn);
    if (!pgn || (!pgn.includes('[Event') && !pgn.includes('[White'))) {
      console.log('[fetchLichessGameMoves] returning null: response is not valid PGN');
      return null;
    }
    const review = buildGameReviewFromPgn(pgn, userResult);
    if (!review) {
      console.log('[fetchLichessGameMoves] returning null: buildGameReviewFromPgn failed');
      return null;
    }
    console.log('[fetchLichessGameMoves] review parsed successfully:', {
      white: review.white,
      black: review.black,
      result: review.result,
      moves: review.moves.length,
      flags: review.flags.length,
    });
    return review;
  } catch (error) {
    console.log('[fetchLichessGameMoves] caught error:', error);
    console.log('[fetchLichessGameMoves] returning null due to caught error');
    return null;
  }
}
