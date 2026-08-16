/** Detect direct `tsx server/src/api/index.ts` even when argv[1] is the tsx CLI. */
export function shouldAutoStartApi(argv: string[] = process.argv): boolean {
  return argv.some((arg) => /(?:^|[\\/])(?:server[\\/]src[\\/])?api[\\/]index\.[cm]?ts$/.test(arg));
}
