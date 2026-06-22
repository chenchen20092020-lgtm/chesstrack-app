import { FontAwesome5 } from '@expo/vector-icons';

export type PieceKey = 'pawn' | 'knight' | 'bishop' | 'rook' | 'queen' | 'king';

type FA5Name = keyof typeof FontAwesome5.glyphMap;

export type Lesson = {
  key: PieceKey;
  name: string;
  icon: FA5Name;
  value: string;
  tagline: string;
  howItMoves: string;
  develop: string;
  manipulate: string;
};

// The square the demo piece sits on in the 8x8 teaching board (row 0 = top).
export const ORIGIN = { r: 4, c: 3 };

export type MoveSquare = { r: number; c: number; type: 'move' | 'capture' };

function inBounds(r: number, c: number): boolean {
  return r >= 0 && r < 8 && c >= 0 && c < 8;
}

// Slides from the origin in one direction until it leaves the board.
function ray(dr: number, dc: number): MoveSquare[] {
  const out: MoveSquare[] = [];
  let r = ORIGIN.r + dr;
  let c = ORIGIN.c + dc;
  while (inBounds(r, c)) {
    out.push({ r, c, type: 'move' });
    r += dr;
    c += dc;
  }
  return out;
}

// Returns the squares a piece can reach from ORIGIN on an empty board.
export function movesFor(key: PieceKey): MoveSquare[] {
  switch (key) {
    case 'rook':
      return [...ray(-1, 0), ...ray(1, 0), ...ray(0, -1), ...ray(0, 1)];
    case 'bishop':
      return [...ray(-1, -1), ...ray(-1, 1), ...ray(1, -1), ...ray(1, 1)];
    case 'queen':
      return [
        ...ray(-1, 0), ...ray(1, 0), ...ray(0, -1), ...ray(0, 1),
        ...ray(-1, -1), ...ray(-1, 1), ...ray(1, -1), ...ray(1, 1),
      ];
    case 'king':
      return [
        [-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1],
      ]
        .map(([dr, dc]) => ({ r: ORIGIN.r + dr, c: ORIGIN.c + dc, type: 'move' as const }))
        .filter((m) => inBounds(m.r, m.c));
    case 'knight':
      return [
        [-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1],
      ]
        .map(([dr, dc]) => ({ r: ORIGIN.r + dr, c: ORIGIN.c + dc, type: 'move' as const }))
        .filter((m) => inBounds(m.r, m.c));
    case 'pawn':
      // White pawn moving "up" the board (decreasing row).
      return [
        { r: ORIGIN.r - 1, c: ORIGIN.c, type: 'move' as const },
        { r: ORIGIN.r - 2, c: ORIGIN.c, type: 'move' as const },
        { r: ORIGIN.r - 1, c: ORIGIN.c - 1, type: 'capture' as const },
        { r: ORIGIN.r - 1, c: ORIGIN.c + 1, type: 'capture' as const },
      ].filter((m) => inBounds(m.r, m.c));
    default:
      return [];
  }
}

// The six pieces in teaching order (simplest movement to most powerful).
export const LESSONS: Lesson[] = [
  {
    key: 'pawn',
    name: 'Pawn',
    icon: 'chess-pawn',
    value: '1 point',
    tagline: 'The soul of chess',
    howItMoves:
      'Moves straight forward one square — or two on its very first move. It captures differently: one square diagonally forward.',
    develop:
      'Use pawns to claim the center (the d- and e-files) early. They form the structure your other pieces stand on.',
    manipulate:
      'Pawns never move backward, so every push is permanent. Reach the far side and your pawn promotes — usually to a queen.',
  },
  {
    key: 'knight',
    name: 'Knight',
    icon: 'chess-knight',
    value: '3 points',
    tagline: 'The tricky jumper',
    howItMoves:
      'Moves in an L-shape: two squares one way, then one at a right angle. It is the only piece that can jump over others.',
    develop:
      'Knights are strongest near the center, where they attack up to eight squares. "A knight on the rim is dim."',
    manipulate:
      'Look for forks — a single knight can attack two pieces at once, like the king and queen together.',
  },
  {
    key: 'bishop',
    name: 'Bishop',
    icon: 'chess-bishop',
    value: '3 points',
    tagline: 'The long-range sniper',
    howItMoves:
      'Slides any number of squares diagonally. Each bishop stays on one color of square for the entire game.',
    develop:
      'Free your bishops early and aim them at the center or the enemy king. A pair of bishops is very powerful.',
    manipulate:
      'Pin enemy pieces against their king or queen along a diagonal so they are stuck and cannot move.',
  },
  {
    key: 'rook',
    name: 'Rook',
    icon: 'chess-rook',
    value: '5 points',
    tagline: 'The heavy artillery',
    howItMoves:
      'Slides any number of squares in straight lines — along ranks (rows) and files (columns).',
    develop:
      'Rooks love open files with no pawns in the way. Connect your rooks and double them on a file for pressure.',
    manipulate:
      'In the endgame, place your rook behind a passed pawn — to push your own or to stop the enemy’s.',
  },
  {
    key: 'queen',
    name: 'Queen',
    icon: 'chess-queen',
    value: '9 points',
    tagline: 'The most powerful piece',
    howItMoves:
      'Moves any number of squares in a straight line OR diagonally — the rook and bishop combined.',
    develop:
      'Do not bring the queen out too early; smaller pieces can chase it and cost you time. Activate it once the board opens.',
    manipulate:
      'The queen excels at forks and double threats. Pair it with another piece to deliver checkmate.',
  },
  {
    key: 'king',
    name: 'King',
    icon: 'chess-king',
    value: 'Priceless',
    tagline: 'The piece you must protect',
    howItMoves:
      'Moves one square in any direction. It can never move into check, and the game ends if it is trapped.',
    develop:
      'Castle early to tuck your king safely behind a wall of pawns. In the opening, safety comes first.',
    manipulate:
      'In the endgame the king becomes a fighter — march it toward the center to support your own pawns.',
  },
];

// Looks up a lesson by piece key.
export function getLesson(key: string | undefined): Lesson | undefined {
  return LESSONS.find((l) => l.key === key);
}
