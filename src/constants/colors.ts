export const Colors = {
  // Base Monochrome
  primary: '#000000',
  ink: '#111111',
  white: '#FFFFFF',
  background: '#FAFAFA',
  surface: '#F5F5F5',
  surfaceCard: '#FFFFFF',
  border: '#E5E5E5',
  borderSubtle: '#EEEEEE',
  borderDark: '#262626',
  muted: '#737373',
  mutedLight: '#A3A3A3',
  darkSurface: '#0A0A0A',
  darkCard: '#141414',
  darkBorder: '#262626',
  darkMuted: '#888888',

  // Semantic Subtle Highlights (Restrained, not saturated)
  success: '#10B981',
  successSubtle: 'rgba(16, 185, 129, 0.12)',
  warning: '#F59E0B',
  warningSubtle: 'rgba(245, 158, 11, 0.12)',
  error: '#EF4444',
  errorSubtle: 'rgba(239, 68, 68, 0.12)',
  accent: '#EF4444',

  // Scanner Terminal Accents
  scannerGreen: '#22C55E',
  scannerDimGreen: 'rgba(34, 197, 94, 0.2)',
  scanGrid: 'rgba(255, 255, 255, 0.05)',
  codeBg: '#121212',
} as const;

export type ColorToken = keyof typeof Colors;
