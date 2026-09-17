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
 *   EQUITY_SFTP_DEBUG      set to "0" to silence ssh2 handshake traces
 *   EQUITY_SFTP_TIMEOUT_MS readyTimeout in ms (default 45000)
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
const debugEnabled = process.env.EQUITY_SFTP_DEBUG !== '0';
const readyTimeout = parseInt(process.env.EQUITY_SFTP_TIMEOUT_MS || '45000', 10);

/**
 * Modern algorithms first, then the legacy set older bank appliances often need.
 * Explicit lists (not just `append`) so the offer is visible in the debug log.
 */
const ALGORITHMS = {
  kex: [
    'curve25519-sha256',
    'curve25519-sha256@libssh.org',
    'ecdh-sha2-nistp256',
    'ecdh-sha2-nistp384',
    'ecdh-sha2-nistp521',
    'diffie-hellman-group-exchange-sha256',
    'diffie-hellman-group14-sha256',
    'diffie-hellman-group16-sha512',
    'diffie-hellman-group18-sha512',
    // Legacy bank / FIPS appliances
    'diffie-hellman-group14-sha1',
    'diffie-hellman-group-exchange-sha1',
    'diffie-hellman-group1-sha1',
  ],
  serverHostKey: [
    'ssh-ed25519',
    'ecdsa-sha2-nistp256',
    'ecdsa-sha2-nistp384',
    'ecdsa-sha2-nistp521',
    'rsa-sha2-512',
    'rsa-sha2-256',
    'ssh-rsa',
    // Rare but still seen on old bank gateways
    'ssh-dss',
  ],
  cipher: [
    'aes256-gcm@openssh.com',
    'aes128-gcm@openssh.com',
    'aes256-ctr',
    'aes192-ctr',
    'aes128-ctr',
    // CBC still required by some HSM-backed SFTP stacks
    'aes256-cbc',
    'aes192-cbc',
    'aes128-cbc',
    '3des-cbc',
  ],
  hmac: [
    'hmac-sha2-256-etm@openssh.com',
    'hmac-sha2-512-etm@openssh.com',
    'hmac-sha2-256',
    'hmac-sha2-512',
    // Common on older bank servers (often the missing piece)
    'hmac-sha1',
    'hmac-sha1-96',
    'hmac-md5',
  ],
  compress: ['none', 'zlib@openssh.com', 'zlib'],
};

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

const started = Date.now();
const elapsed = () => `+${String(Date.now() - started).padStart(5)}ms`;

/** Milestones we care about when diagnosing a handshake stall. */
const milestones = {
  tcpHint: false,
  localIdent: false,
  remoteIdent: false,
  kexOutbound: false,
  kexInbound: false,
  kexDone: false,
  hostKey: false,
  authStart: false,
  ready: false,
};

const debugLines = [];

function classifyStall() {
  if (!milestones.remoteIdent) {
    return (
      'Never received an SSH banner (Remote ident). TCP accepted but the peer ' +
      'is not speaking SSH, is filtering after accept, or is extremely slow.'
    );
  }
  if (!milestones.kexInbound) {
    return (
      'Got Remote ident but never received KEXINIT. Stall is between banner and ' +
      'key exchange — often a middlebox or a server that hangs before offering algorithms.'
    );
  }
  if (!milestones.kexDone) {
    return (
      'Both sides sent KEXINIT but key exchange never finished. Strongly suggests ' +
      'no overlapping kex / host key / cipher / hmac — check the debug lines for ' +
      '"no matching" / "handshake failed".'
    );
  }
  if (!milestones.authStart) {
    return (
      'Key exchange completed but authentication never started. Unusual — capture ' +
      'the full debug log for Equity.'
    );
  }
  return 'Handshake progressed into authentication; this is no longer a pre-auth stall.';
}

function onDebug(message) {
  const line = String(message);
  debugLines.push(`${elapsed()} ${line}`);
  if (debugEnabled) {
    console.log(`${elapsed()} [ssh2] ${line}`);
  }

  const lower = line.toLowerCase();
  if (lower.includes('local ident')) milestones.localIdent = true;
  if (lower.includes('remote ident')) milestones.remoteIdent = true;
  if (lower.includes('outbound') && lower.includes('kexinit')) milestones.kexOutbound = true;
  if (lower.includes('inbound') && lower.includes('kexinit')) milestones.kexInbound = true;
  if (
    lower.includes('inbound: received newkeys') ||
    lower.includes('outbound: sending newkeys') ||
    lower.includes('handshake complete') ||
    (lower.includes('negotiated') && lower.includes('kex'))
  ) {
    milestones.kexDone = true;
  }
  if (lower.includes('attempting') && lower.includes('authentication')) {
    milestones.authStart = true;
    console.log(
      `${elapsed()} >>> Authentication about to begin — credentials will be sent after this point`
    );
  }
  if (lower.includes('socket') && (lower.includes('connected') || lower.includes('connect'))) {
    milestones.tcpHint = true;
  }
}

console.log(`Target       : ${host}:${port}`);
console.log(`Username     : ${mask(username)} (length ${username.length})`);
console.log(`Password     : present (length ${password.length}) — not printed`);
console.log(`Remote dir   : ${remoteDir}`);
console.log(`readyTimeout : ${readyTimeout}ms`);
console.log(`ssh2 debug   : ${debugEnabled ? 'ON' : 'OFF (set EQUITY_SFTP_DEBUG=1)'}`);
console.log('');
console.log('Offering algorithms (modern first, then legacy bank fall-backs):');
console.log(`  kex      : ${ALGORITHMS.kex.join(', ')}`);
console.log(`  hostKey  : ${ALGORITHMS.serverHostKey.join(', ')}`);
console.log(`  cipher   : ${ALGORITHMS.cipher.join(', ')}`);
console.log(`  hmac     : ${ALGORITHMS.hmac.join(', ')}`);
console.log('');
console.log(
  'Note: password is only sent AFTER the SSH handshake completes. A timeout before'
);
console.log(
  '"Authentication about to begin" is NOT a failed-auth / lockout event.'
);
console.log('');

const sftp = new Client();

(async () => {
  try {
    await sftp.connect({
      host,
      port,
      username,
      password,
      readyTimeout,
      algorithms: ALGORITHMS,
      debug: onDebug,
      hostVerifier: (key) => {
        milestones.hostKey = true;
        const fingerprint = crypto
          .createHash('sha256')
          .update(key)
          .digest('base64')
          .replace(/=+$/, '');
        console.log(`${elapsed()} Host key     : SHA256:${fingerprint}`);
        console.log(`${elapsed()}                ^ record this, confirm with the bank, then pin it`);
        // First contact: accept so we can record the fingerprint. Real client
        // code must compare against a pinned value instead of returning true.
        return true;
      },
    });

    milestones.ready = true;
    console.log(`\n${elapsed()} AUTH OK — SSH handshake + password auth both succeeded\n`);

    const entries = await sftp.list(remoteDir);
    console.log(
      `Listing of "${remoteDir}" — ${entries.length} entr${entries.length === 1 ? 'y' : 'ies'}:`
    );

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
    console.error(`\nRESULT: FAILED after ${elapsed()}`);
    console.error(`  ${error.message}`);
    if (error.level) console.error(`  level: ${error.level}`);

    console.error('\n--- Handshake milestone summary ---');
    console.error(`  TCP / socket hint     : ${milestones.tcpHint ? 'yes' : 'not seen in debug'}`);
    console.error(`  Local SSH ident sent  : ${milestones.localIdent ? 'yes' : 'NO'}`);
    console.error(`  Remote SSH ident recv : ${milestones.remoteIdent ? 'yes' : 'NO'}`);
    console.error(`  KEXINIT outbound      : ${milestones.kexOutbound ? 'yes' : 'NO'}`);
    console.error(`  KEXINIT inbound       : ${milestones.kexInbound ? 'yes' : 'NO'}`);
    console.error(`  Key exchange done     : ${milestones.kexDone ? 'yes' : 'NO'}`);
    console.error(`  Host key verified     : ${milestones.hostKey ? 'yes' : 'NO'}`);
    console.error(`  Auth started          : ${milestones.authStart ? 'yes' : 'NO'}`);
    console.error(`\n  Likely cause: ${classifyStall()}`);

    if (!milestones.authStart) {
      console.error(
        '\n  Credentials were NOT sent. This attempt should not count toward'
      );
      console.error('  password lockout. Safe to retry after you capture this log.');
    } else {
      console.error(
        '\n  Credentials may have been sent. Do not retry blindly — partner'
      );
      console.error('  SFTP accounts commonly lock after a few failed authentications.');
    }

    if (!debugEnabled && debugLines.length > 0) {
      console.error('\n--- Last debug lines (enable EQUITY_SFTP_DEBUG=1 for live trace) ---');
      for (const line of debugLines.slice(-40)) {
        console.error(`  ${line}`);
      }
    }

    process.exitCode = 1;
  } finally {
    try {
      await sftp.end();
    } catch {
      /* connection may already be gone */
    }
  }
})();
