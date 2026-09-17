/**
 * One-off diagnostic: prove SFTP login works from a deployed service's egress IP.
 *
 * Not application code. Not imported by the backend. Intended to be fetched into
 * a scratch directory, run once, and deleted.
 *
 * Read-only: authenticates and lists a remote directory. It never uploads,
 * writes, or deletes, and never prints the password.
 *
 * All partner-specific values come from the environment so that nothing
 * identifying the integration lives in this (public) repository.
 *
 * Required env:
 *   EQUITY_SFTP_HOST       partner SFTP host
 *   EQUITY_SFTP_PORT       partner SFTP port
 *   EQUITY_SFTP_USERNAME   set as a service environment variable
 *   EQUITY_SFTP_PASSWORD   set as a service environment variable
 * Optional env:
 *   EQUITY_SFTP_DIR        remote directory to list, defaults to "."
 *
 * Requires: npm install ssh2-sftp-client
 */

const crypto = require('crypto');
const Client = require('ssh2-sftp-client');

const host = process.env.EQUITY_SFTP_HOST;
const port = parseInt(process.env.EQUITY_SFTP_PORT || '', 10);
const username = process.env.EQUITY_SFTP_USERNAME;
const password = process.env.EQUITY_SFTP_PASSWORD;
const remoteDir = process.env.EQUITY_SFTP_DIR || '.';

const mask = (value) => {
  if (!value) return '(unset)';
  if (value.length <= 2) return '**';
  return `${value[0]}${'*'.repeat(value.length - 2)}${value[value.length - 1]}`;
};

const missing = [];
if (!host) missing.push('EQUITY_SFTP_HOST');
if (!port) missing.push('EQUITY_SFTP_PORT');
if (!username) missing.push('EQUITY_SFTP_USERNAME');
if (!password) missing.push('EQUITY_SFTP_PASSWORD');

if (missing.length > 0) {
  console.error(`ABORT: missing required env: ${missing.join(', ')}`);
  process.exit(2);
}

console.log(`Target       : ${host}:${port}`);
console.log(`Username     : ${mask(username)} (length ${username.length})`);
console.log(`Password     : present (length ${password.length}) — not printed`);
console.log(`Remote dir   : ${remoteDir}`);
console.log('');

const sftp = new Client();

(async () => {
  const started = Date.now();

  try {
    await sftp.connect({
      host,
      port,
      username,
      password,
      readyTimeout: 20000,
      // Bank SSH servers are often years behind. `append` keeps modern
      // algorithms first and only falls back to these if the server insists.
      algorithms: {
        kex: { append: ['diffie-hellman-group14-sha1', 'diffie-hellman-group-exchange-sha1'] },
        serverHostKey: { append: ['ssh-rsa'] },
        cipher: { append: ['aes256-cbc', 'aes128-cbc'] },
      },
      hostVerifier: (key) => {
        const fingerprint = crypto
          .createHash('sha256')
          .update(key)
          .digest('base64')
          .replace(/=+$/, '');
        console.log(`Host key     : SHA256:${fingerprint}`);
        console.log('               ^ record this, confirm it with the bank, then pin it');
        // First contact: accept so we can record the fingerprint. Real client
        // code must compare against a pinned value instead of returning true.
        return true;
      },
    });

    console.log(`\nAUTH OK (${Date.now() - started}ms)\n`);

    const entries = await sftp.list(remoteDir);
    console.log(`Listing of "${remoteDir}" — ${entries.length} entr${entries.length === 1 ? 'y' : 'ies'}:`);

    for (const entry of entries) {
      const kind = entry.type === 'd' ? 'dir ' : entry.type === '-' ? 'file' : `${entry.type}   `;
      const size = String(entry.size).padStart(10);
      const modified = new Date(entry.modifyTime).toISOString();
      console.log(`  ${kind} ${size}  ${modified}  ${entry.name}`);
    }

    if (entries.length === 0) {
      console.log('  (empty — normal for a freshly provisioned drop box)');
    }

    console.log('\nRESULT: SUCCESS — login and directory listing both worked.');
  } catch (error) {
    console.error(`\nRESULT: FAILED after ${Date.now() - started}ms`);
    console.error(`  ${error.message}`);
    if (error.level) console.error(`  level: ${error.level}`);
    console.error('\n  Do not retry blindly — partner SFTP accounts commonly lock');
    console.error('  after a few failed authentications.');
    process.exitCode = 1;
  } finally {
    try {
      await sftp.end();
    } catch {
      /* connection may already be gone */
    }
  }
})();
