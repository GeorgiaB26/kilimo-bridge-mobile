/**
 * Read-only check of the Equity SFTP connection. Makes ONE connection (no retries), lists the
 * file names and sizes in the inbound and outbound directories, and disconnects.
 * It does not upload, download, rename or delete anything, and never prints the password.
 *
 * Run from backend/: npx tsx scripts/check-equity-sftp.ts
 * Needs EQUITY_SFTP_HOST, EQUITY_SFTP_USERNAME, EQUITY_SFTP_PASSWORD, EQUITY_SFTP_HOST_KEY_SHA256
 * (optional: EQUITY_SFTP_PORT, EQUITY_SFTP_OUTBOUND_DIR, EQUITY_SFTP_INBOUND_DIR).
 */
import { config as loadEnv } from 'dotenv';
import path from 'path';

loadEnv({ path: path.resolve(process.cwd(), '.env') });

import {
  connectEquitySftp,
  describeError,
  loadEquitySftpConfig,
  type SftpClientLike,
} from '../src/services/equitySftpService';

async function listDirectory(client: SftpClientLike, label: string, dir: string): Promise<void> {
  console.log(`${label} ${dir}`);
  try {
    const entries = await client.list(dir);
    if (entries.length === 0) {
      console.log('  (empty)');
      return;
    }
    for (const e of [...entries].sort((a, b) => a.name.localeCompare(b.name))) {
      console.log(`  ${e.name}  ${e.size} bytes`);
    }
  } catch (err) {
    console.log(`  could not list: ${describeError(err, process.env.EQUITY_SFTP_PASSWORD)}`);
  }
}

async function main(): Promise<void> {
  const config = loadEquitySftpConfig();
  console.log(`Connecting to ${config.host}:${config.port} as ${config.username} (one attempt)`);

  const client = await connectEquitySftp(config);
  try {
    console.log('Connected; host key matched the pinned fingerprint.');
    await listDirectory(client, 'Inbound ', config.inboundDir);
    await listDirectory(client, 'Outbound', config.outboundDir);
  } finally {
    await client.end().catch(() => undefined);
    console.log('Disconnected.');
  }
}

main().catch((err) => {
  console.error('Equity SFTP check failed:', describeError(err, process.env.EQUITY_SFTP_PASSWORD));
  process.exitCode = 1;
});
