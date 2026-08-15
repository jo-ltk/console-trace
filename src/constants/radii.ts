// Modern rounded geometry tokens
export const Radii = {
  sm: 10,
  md: 14,
  lg: 18,
  xl: 24,
  card: 24,
  button: 16,
  input: 16,
  chip: 10,
  sheet: 30,
  nav: 26,
  full: 9999,
} as const;

export type RadiiToken = keyof typeof Radii;
