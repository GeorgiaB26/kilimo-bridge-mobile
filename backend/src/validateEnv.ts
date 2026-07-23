/** Warn or fail fast when Render env vars were copied from docs literally. */
export function validateProductionEnv(): void {
  if (process.env.NODE_ENV !== 'production') return;

  const problems: string[] = [];

  const jwt = process.env.JWT_SECRET ?? '';
  if (!jwt || jwt.length < 32 || /openssl|change-this|<run:/i.test(jwt)) {
    problems.push(
      'JWT_SECRET is missing or still a placeholder. Run: openssl rand -hex 32 — paste the output in Render.'
    );
  }

  const enc = process.env.ENCRYPTION_KEY ?? '';
  if (!enc || enc.length < 16 || /openssl|change-this|<run:/i.test(enc)) {
    problems.push(
      'ENCRYPTION_KEY is missing or still a placeholder. Run: openssl rand -hex 32 — paste the output in Render.'
    );
  }

  if (problems.length > 0) {
    console.error('\n=== Render environment misconfiguration ===');
    for (const p of problems) console.error(`  • ${p}`);
    console.error('============================================\n');
    // Do not exit — login still works with weak keys; admin must fix env vars.
  }
}
