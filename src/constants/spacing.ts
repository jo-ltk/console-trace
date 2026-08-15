// 8px-based spacing system
export const Spacing = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  huge: 40,
  massive: 48,
  epic: 64,
} as const;

export type SpacingToken = keyof typeof Spacing;
