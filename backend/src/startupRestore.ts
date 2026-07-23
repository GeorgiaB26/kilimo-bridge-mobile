import { getFarmerCount, replaceDatabaseFile } from './db/database';

const MIN_FARMERS = 100;

/** On Render free tier, redeploys wipe SQLite — auto-download backup if configured. */
export async function maybeRestoreDatabaseOnStartup(): Promise<void> {
  const count = getFarmerCount();
  if (count >= MIN_FARMERS) {
    console.log(`Database ready: ${count} farmers`);
    return;
  }

  const url = process.env.STARTUP_DB_URL;
  if (!url) {
    console.log(
      `Only ${count} farmers in database. Upload with push-db-to-render.sh or set STARTUP_DB_URL on Render.`
    );
    return;
  }

  try {
    console.log('Downloading database backup from STARTUP_DB_URL…');
    const headers: Record<string, string> = {};
    const token = process.env.STARTUP_DB_TOKEN;
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetch(url, { headers });
    if (!response.ok) {
      throw new Error(`STARTUP_DB_URL download failed: HTTP ${response.status}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length < 10_000) {
      throw new Error('Downloaded database file is too small — check STARTUP_DB_URL');
    }

    const farmers = replaceDatabaseFile(buffer);
    console.log(`Restored ${farmers} farmers from startup backup`);
  } catch (err) {
    console.error(
      'STARTUP_DB_URL restore failed — continuing with existing database:',
      err instanceof Error ? err.message : err
    );
  }
}
