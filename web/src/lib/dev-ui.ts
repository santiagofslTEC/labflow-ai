// /dev/ui shows locally and on Vercel preview deploys, never in production (AC-16).
// VERCEL_ENV, not NODE_ENV: NODE_ENV is "production" on preview builds too.
export const isDevUiEnabled = (vercelEnv: string | undefined): boolean =>
  vercelEnv !== "production";
