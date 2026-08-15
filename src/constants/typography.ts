import { TextStyle, Platform } from 'react-native';

export const Typography = {
  // Wordmark & Diagnostic Pixel typography
  brandTitle: {
    fontFamily: Platform.select({
      ios: 'Courier',
      android: 'monospace',
      default: 'monospace',
    }),
    fontSize: 22,
    letterSpacing: 3,
    fontWeight: '700' as TextStyle['fontWeight'],
  },
  pixelScoreHero: {
    fontFamily: Platform.select({
      ios: 'Courier',
      android: 'monospace',
      default: 'monospace',
    }),
    fontSize: 64,
    letterSpacing: -2,
    fontWeight: '700' as TextStyle['fontWeight'],
  },
  pixelScore: {
    fontFamily: Platform.select({
      ios: 'Courier',
      android: 'monospace',
      default: 'monospace',
    }),
    fontSize: 28,
    letterSpacing: -0.5,
    fontWeight: '700' as TextStyle['fontWeight'],
  },
  pixelLabel: {
    fontFamily: Platform.select({
      ios: 'Courier',
      android: 'monospace',
      default: 'monospace',
    }),
    fontSize: 11,
    letterSpacing: 1.5,
    textTransform: 'uppercase' as TextStyle['textTransform'],
    fontWeight: '600' as TextStyle['fontWeight'],
  },
  pixelCode: {
    fontFamily: Platform.select({
      ios: 'Courier',
      android: 'monospace',
      default: 'monospace',
    }),
    fontSize: 13,
    letterSpacing: 0.2,
  },

  // Geist Sans / Body / Navigation / UI Typography
  heroTitle: {
    fontSize: 34,
    lineHeight: 40,
    letterSpacing: -0.8,
    fontWeight: '700' as TextStyle['fontWeight'],
  },
  title1: {
    fontSize: 26,
    lineHeight: 32,
    letterSpacing: -0.5,
    fontWeight: '600' as TextStyle['fontWeight'],
  },
  title2: {
    fontSize: 20,
    lineHeight: 26,
    letterSpacing: -0.3,
    fontWeight: '600' as TextStyle['fontWeight'],
  },
  headline: {
    fontSize: 16,
    lineHeight: 22,
    letterSpacing: -0.2,
    fontWeight: '600' as TextStyle['fontWeight'],
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
    letterSpacing: -0.1,
    fontWeight: '400' as TextStyle['fontWeight'],
  },
  bodyMedium: {
    fontSize: 15,
    lineHeight: 22,
    letterSpacing: -0.1,
    fontWeight: '500' as TextStyle['fontWeight'],
  },
  codeSnippet: {
    fontFamily: Platform.select({
      ios: 'Courier',
      android: 'monospace',
      default: 'monospace',
    }),
    fontSize: 12,
    lineHeight: 18,
  },
  bodySmall: {
    fontSize: 13,
    lineHeight: 18,
    letterSpacing: 0,
    fontWeight: '400' as TextStyle['fontWeight'],
  },
  caption: {
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.2,
    fontWeight: '500' as TextStyle['fontWeight'],
  },
  buttonText: {
    fontSize: 14,
    lineHeight: 18,
    letterSpacing: 0.4,
    fontWeight: '600' as TextStyle['fontWeight'],
  },
  navLabel: {
    fontSize: 10,
    lineHeight: 14,
    letterSpacing: 0.8,
    textTransform: 'uppercase' as TextStyle['textTransform'],
    fontWeight: '700' as TextStyle['fontWeight'],
  },
} as const;
