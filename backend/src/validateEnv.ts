/**
 * Development-only signing secret used when JWT_SECRET is unset. It is public (it lives in the
 * repo), so production must never run with it — validateProductionEnv() refuses to start.
 */
export const DEV_JWT_SECRET_FALLBACK = 'kilimo-bridge-dev-secret-change-in-production';

/**
 * Validate production env vars on startup.
 *
 * Fatal (process exits): JWT_SECRET missing or equal to the hardcoded dev fallback — anyone could
 * forge tokens. Everything else is a warning only.
 *
 * `env` and `exit` are injectable for tests.
 */
export function validateProductionEnv(
  env: NodeJS.ProcessEnv = process.env,
  exit: (code: number) => void = (code) => process.exit(code)
): void {
  if (env.NODE_ENV !== 'production') return;

  const problems: string[] = [];
  const fatal: string[] = [];

  const jwt = (env.JWT_SECRET ?? '').trim();
  if (!jwt || jwt === DEV_JWT_SECRET_FALLBACK) {
    fatal.push(
      'JWT_SECRET is missing or equals the built-in development fallback. Refusing to start in production.'
    );
  } else if (jwt.length < 32 || /openssl|change-this|<run:/i.test(jwt)) {
    problems.push(
      'JWT_SECRET is missing or still a placeholder. Run: openssl rand -hex 32 — paste the output in Render.'
    );
  }

  const enc = env.ENCRYPTION_KEY ?? '';
  if (!enc || enc.length < 16 || /openssl|change-this|<run:/i.test(enc)) {
    problems.push(
      'ENCRYPTION_KEY is missing or still a placeholder. Run: openssl rand -hex 32 — paste the output in Render.'
    );
  }

  if (problems.length > 0 || fatal.length > 0) {
    console.error('\n=== Render environment misconfiguration ===');
    for (const p of fatal) console.error(`  • FATAL: ${p}`);
    for (const p of problems) console.error(`  • ${p}`);
    console.error('============================================\n');
  }

  if (fatal.length > 0) {
    exit(1);
  }
}
