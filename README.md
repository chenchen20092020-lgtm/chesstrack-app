# ChessTrack

A mobile app for serious chess improvers to **track their rating, review their games, and turn losses into lessons**. Built with [Expo](https://expo.dev) and [Expo Router](https://docs.expo.dev/router/introduction).

## Features

- **Rating tracker** — log your rating manually or sync automatically from **Chess.com** and **Lichess**, visualised as a trend line over time.
- **Game history** — recent games are pulled from your connected account, with results, opponents, and time controls.
- **Game review** — paste or open a game and get a move-by-move replay with heuristic flags (opening issues, time-pressure blunders, king-safety, development problems) and a concrete recommendation.
- **Pattern analysis** — tag your mistakes (tactical miss, time pressure, opening mistake, etc.) and see which recurring weaknesses cost you the most points.
- **Voice journal** — record spoken reflections after a game; transcripts are summarised into bullet points or a short paragraph via the Groq LLaMA API.
- **Goals & streaks** — set a target rating, track progress, and keep a daily-consistency streak.

## Tech stack

- Expo SDK 54 / React Native 0.81 / React 19
- Expo Router (file-based routing) with a custom horizontal-pager tab navigator
- `chess.js` for PGN parsing and move replay, `react-native-chessboard` for the board
- `react-native-reanimated` + `react-native-gesture-handler` for the swipeable tab pager
- `react-native-chart-kit` for the rating chart
- AsyncStorage for local persistence (see `lib/storage.ts`)
- Groq API for voice-note summarisation (see `lib/voiceToText.ts`)

## Getting started

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create a `.env` file in the project root with your Groq API key (required for the voice journal's AI summaries):

   ```
   EXPO_PUBLIC_GROQ_API_KEY=your_key_here
   ```

3. Start the dev server:

   ```bash
   npx expo start
   ```

   Then open the app in [Expo Go](https://expo.dev/go) (scan the QR code), an Android emulator, or an iOS simulator.

## Project structure

```
app/                 Screens (Expo Router file-based routes)
  (tabs)/            Home, Tracker, History, Journal, Patterns, Settings
  _layout.tsx        Root stack + font/splash loading
  onboarding.tsx     First-launch onboarding flow
  game-review.tsx    Interactive game review (modal)
components/          Shared UI (BrandSplash)
lib/                 Data + logic
  api.ts             Chess.com / Lichess fetching + PGN review engine
  storage.ts         AsyncStorage persistence + types
  voiceToText.ts     Groq transcription summarisation
  theme.ts           Design tokens (colors, fonts, spacing, radius, shadows)
  tab-context.ts     Cross-screen tab navigation context
```

## Notes

- All data is stored locally on-device via AsyncStorage; there is no backend account system.
- `EXPO_PUBLIC_*` env vars are embedded in the client bundle — only use keys that are safe to ship to the client.
