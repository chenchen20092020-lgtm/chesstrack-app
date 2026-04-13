export const colors = {
  // Backgrounds — pure dark, no purple tint
  bg: '#0C0C0C',
  surface: '#161616',
  surfaceRaised: '#1E1E1E',
  surfaceHighlight: '#252525',

  // Borders — neutral gray only
  border: '#2C2C2C',
  borderLight: '#383838',

  // Text
  textPrimary: '#F5F5F5',
  textSecondary: '#888888',
  textMuted: '#555555',

  // Accent — champagne/platinum
  accent: '#C9B785',
  accentDim: '#8A7D55',
  accentLight: '#E8D9A8',

  // Semantic
  success: '#6BCB8B',
  danger: '#E05A5A',
  warning: '#E8A87C',
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
