// Plain-language coaching layer on top of the engine analysis. Groq (LLaMA) is
// given the engine's verdict (move played, better move, eval swing, position)
// and only EXPLAINS it — it never decides what was a mistake, so it cannot
// invent the analysis. Requires EXPO_PUBLIC_GROQ_API_KEY (already configured).

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

export type MistakeContext = {
  moveNumber: number;
  color: 'w' | 'b';
  played: string; // SAN actually played
  best: string | null; // engine's best move, SAN
  evalBefore: number; // user-POV centipawns before the move
  evalAfter: number; // user-POV centipawns after the move
  classification: string; // blunder / mistake / inaccuracy
  fenBefore: string; // position before the move was played
};

const SYSTEM_PROMPT =
  'You are a concise, honest chess coach for beginners. You are given a list of ' +
  'mistakes a player made. For each one you get the position (FEN), the move they ' +
  'played, the better move the engine recommends, and how the evaluation changed. ' +
  'For each mistake, write ONE short sentence (max ~22 words) in plain language ' +
  'explaining what went wrong or why the engine move is better — for example that a ' +
  'piece was left hanging, a tactic was missed, the king was exposed, or material ' +
  'was lost. Be concrete and encouraging. Do NOT invent moves or claims beyond the ' +
  'information given, and do not contradict the engine. Respond with ONLY a JSON ' +
  'object of the form {"explanations": ["...", "..."]}, one sentence per mistake, in ' +
  'the same order.';

function fmtPawns(cp: number): string {
  return `${cp >= 0 ? '+' : ''}${(cp / 100).toFixed(1)}`;
}

// Returns one plain-language explanation per mistake (same order), or null on
// failure / missing key so the caller can simply show nothing extra.
export async function explainMistakes(items: MistakeContext[]): Promise<string[] | null> {
  if (items.length === 0) return [];
  const apiKey = process.env.EXPO_PUBLIC_GROQ_API_KEY;
  if (!apiKey) return null;

  try {
    const payload = items.map((m, i) => ({
      n: i + 1,
      sideToMove: m.color === 'w' ? 'White' : 'Black',
      played: `${m.moveNumber}${m.color === 'w' ? '.' : '...'} ${m.played}`,
      engineBest: m.best ?? 'unknown',
      evalChange: `${fmtPawns(m.evalBefore)} to ${fmtPawns(m.evalAfter)} (player's perspective, in pawns)`,
      severity: m.classification,
      fen: m.fenBefore,
    }));

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    const res = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          {
            role: 'user',
            content: `Mistakes (JSON):\n${JSON.stringify(payload)}\n\nReturn one explanation per mistake, in order.`,
          },
        ],
        max_tokens: 600,
        temperature: 0.3,
        response_format: { type: 'json_object' },
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) return null;

    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = data.choices?.[0]?.message?.content;
    if (!content) return null;

    const parsed = JSON.parse(content) as { explanations?: unknown } | unknown[];
    const arr = Array.isArray(parsed)
      ? parsed
      : Array.isArray((parsed as { explanations?: unknown }).explanations)
        ? (parsed as { explanations: unknown[] }).explanations
        : null;
    if (!arr) return null;

    return arr.map((s) => String(s));
  } catch {
    return null;
  }
}
