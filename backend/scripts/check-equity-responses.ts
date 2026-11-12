/**
 * Read-only look at Equity's INBOUND directory. Makes ONE SFTP connection (no retries), lists the
 * ACK_* / NACK_* / PSR_* file names with their size and whether we have already stored each one
 * (a SELECT on equity_response_files), then disconnects.
 *
 * It does not download, decrypt, store, delete or change anything, and never prints the
 * password. File contents are never read.
 *
 * Run from backend/: npx tsx scripts/check-equity-responses.ts
 * Needs DATABASE_URL and the EQUITY_SFTP_* variables (see check-equity-sftp.ts).
 */
import { config as loadEnv } from 'dotenv';
import path from 'path';

loadEnv({ path: path.resolve(process.cwd(), '.env') });

import { closeDatabase, query } from '../src/db/database';
import {
  findStoredFilenames,
  pickInboundResponseFiles,
} from '../src/services/equityResponseService';
import {
  connectEquitySftp,
  describeError,
  loadEquitySftpConfig,
} from '../src/services/equitySftpService';

async function main(): Promise<void> {
  const config = loadEquitySftpConfig();
  console.log(`Connecting to ${config.host}:${config.port} as ${config.username} (one attempt)`);

  const client = await connectEquitySftp(config);
  let listing;
  try {
    listing = await client.list(config.inboundDir);
  } finally {
    await client.end().catch(() => undefined);
    console.log('Disconnected.');
  }

  const files = pickInboundResponseFiles(listing);
  const stored = await findStoredFilenames(
    (text, params) => query(text, params),
    files.map((f) => f.name)
  );

  console.log(`Inbound ${config.inboundDir}: ${listing.length} entries, ${files.length} response files`);
  let fresh = 0;
  for (const f of files) {
    const isNew = !stored.has(f.name);
    if (isNew) fresh++;
    console.log(`  ${isNew ? 'NEW   ' : 'stored'}  ${f.kind.toUpperCase().padEnd(4)}  ${f.name}  ${f.size} bytes`);
  }
  console.log(`New (not yet stored): ${fresh}`);
}

main()
  .catch((err) => {
    console.error('Equity response check failed:', describeError(err, process.env.EQUITY_SFTP_PASSWORD));
    process.exitCode = 1;
  })
  .finally(() => closeDatabase());
