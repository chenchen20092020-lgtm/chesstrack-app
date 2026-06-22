export const colors = {
  // Backgrounds — soft warm charcoal (never pure black)
  bg: '#14110D',
  surface: '#1C1813',
  surfaceRaised: '#221D16',
  surfaceHighlight: '#2B251C',

  // Borders — warm neutral
  border: '#322B22',
  borderLight: '#3E362B',

  // Text — warm whites and grays
  textPrimary: '#F4F1EA',
  textSecondary: '#9A9080',
  textMuted: '#645B4D',

  // Accent — champagne / platinum gold
  accent: '#C9B785',
  accentDim: '#8A7D55',
  accentLight: '#E8D9A8',

  // Secondary highlight (value badges, achievements) — brighter honey
  gold: '#E0C892',
  goldDim: '#A8945E',

  // Semantic
  success: '#6FC08A',
  danger: '#E06A5E',
  warning: '#E0A45A',
};

export const fonts = {
  // Headlines — Playfair Display Bold
  headline: 'PlayfairDisplay_700Bold',
  // Subheadlines — Playfair Display regular
  subheadline: 'PlayfairDisplay_400Regular',
  // All UI text, buttons, labels, body
  ui: 'Inter_500Medium',
  // Descriptions, secondary text
  body: 'Inter_400Regular',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const radius = {
  sm: 8,
  md: 12,
  lg: 20,
  xl: 32,
  full: 999,
};

export const shadows = {
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 8,
  },
  accent: {
    shadowColor: '#C9B785',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 6,
  },
};
