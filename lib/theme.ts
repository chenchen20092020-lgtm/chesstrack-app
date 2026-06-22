export const colors = {
  // Backgrounds — deep forest-black with a faint green undertone (growth/calm)
  bg: '#0B0F0D',
  surface: '#111714',
  surfaceRaised: '#16211B',
  surfaceHighlight: '#1F2C24',

  // Borders — green-tinted neutral
  border: '#243029',
  borderLight: '#2F3D35',

  // Text
  textPrimary: '#F1F5F2',
  textSecondary: '#8A968F',
  textMuted: '#56605A',

  // Accent — emerald (growth, learning, progress)
  accent: '#3FA37A',
  accentDim: '#2B6F52',
  accentLight: '#6FD3A6',

  // Secondary highlight — champagne gold, reserved for achievements
  gold: '#C9B785',
  goldDim: '#8A7D55',

  // Semantic
  success: '#5FD08A',
  danger: '#E0655B',
  warning: '#E8B57C',
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
    shadowColor: '#3FA37A',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 6,
  },
};
