/**
 * One-off diagnostic: dump the usage flags of a PGP public key.
 *
 * Written to distinguish three very different causes of the openpgp.js error
 * "None of the key flags is set", because the remedy differs in each case:
 *
 *   A. No Key Flags subpacket at all. RFC 4880 makes subpacket 27 optional and
 *      lets an implementation infer capability from the algorithm, which is what
 *      GnuPG does. Such a key works in GPG but is refused by strict libraries.
 *      Interoperability gap, not a corrupt key.
 *   B. Key Flags present but zero. GnuPG treats this as "no capabilities at all"
 *      rather than falling back to algorithm defaults, so the key is genuinely
 *      unusable everywhere. Sender-side error.
 *   C. Flags set to signing only, with no encryption subkey. The wrong kind of
 *      key was issued. Sender-side error.
 *
 * Usage:
 *   node inspect-pgp-key.js [path-to-armoured-key]
 * Falls back to EQUITY_BANK_PUBLIC_KEY_PATH when no path is given.
 *
 * Requires: npm install openpgp@^6
 */

const fs = require('fs');

const keyPath = process.argv[2] || process.env.EQUITY_BANK_PUBLIC_KEY_PATH;

if (!keyPath) {
  console.error('ABORT: pass a key path or set EQUITY_BANK_PUBLIC_KEY_PATH');
  process.exit(2);
}
if (!fs.existsSync(keyPath)) {
  console.error(`ABORT: no file at ${keyPath}`);
  process.exit(2);
}

// RFC 4880 section 5.2.3.21.
const FLAG_BITS = [
  [0x01, 'certify other keys'],
  [0x02, 'sign data'],
  [0x04, 'encrypt communications'],
  [0x08, 'encrypt storage'],
  [0x10, 'split key'],
  [0x20, 'authentication'],
  [0x80, 'shared private key'],
];

/**
 * Returns a human description plus which of the three cases above applies,
 * treating an absent subpacket and a present-but-zero subpacket as distinct.
 */
function describeFlags(keyFlags) {
  if (keyFlags === undefined || keyFlags === null) {
    return { state: 'ABSENT', text: 'no Key Flags subpacket present' };
  }

  const bytes = Array.from(keyFlags);
  if (bytes.length === 0) {
    return { state: 'ZERO_LENGTH', text: 'Key Flags subpacket present but empty' };
  }

  const hex = bytes.map((b) => b.toString(16).padStart(2, '0')).join(' ');
  const first = bytes[0];

  if (bytes.every((b) => b === 0)) {
    return { state: 'ZERO', text: `Key Flags present but all zero (0x${hex}) — asserts no capabilities` };
  }

  const named = FLAG_BITS.filter(([bit]) => (first & bit) !== 0).map(([, name]) => name);
  return {
    state: 'SET',
    text: `0x${hex} → ${named.length > 0 ? named.join(', ') : 'unrecognised bits'}`,
    canEncrypt: (first & 0x04) !== 0 || (first & 0x08) !== 0,
    canSign: (first & 0x02) !== 0,
  };
}

function reportSignatureFlags(label, signatures) {
  if (!signatures || signatures.length === 0) {
    console.log(`  ${label}: none found`);
    return [];
  }

  const results = [];
  signatures.forEach((sig, index) => {
    const described = describeFlags(sig.keyFlags);
    const version = sig.version !== undefined ? ` (sig v${sig.version})` : '';
    console.log(`  ${label}[${index}]${version}: ${described.text}`);
    results.push(described);
  });
  return results;
}

(async () => {
  const openpgp = await import('openpgp');
  const armored = fs.readFileSync(keyPath, 'utf8');

  console.log(`File         : ${keyPath}`);
  console.log(`First line   : ${armored.split('\n')[0]}`);
  console.log('');

  const key = await openpgp.readKey({ armoredKey: armored });
  const algorithm = key.getAlgorithmInfo();

  console.log('=== PRIMARY KEY ===');
  console.log(`  Fingerprint : ${key.getFingerprint().toUpperCase().match(/.{1,4}/g).join(' ')}`);
  console.log(`  Key ID      : ${key.getKeyID().toHex().toUpperCase()}`);
  console.log(`  Algorithm   : ${algorithm.algorithm} ${algorithm.bits || ''}`);
  console.log(`  Version     : v${key.keyPacket.version}`);
  console.log(`  Created     : ${key.getCreationTime().toISOString()}`);
  console.log(`  User IDs    : ${key.getUserIDs().join(', ') || '(none)'}`);

  const expiration = await key.getExpirationTime();
  console.log(`  Expires     : ${expiration === Infinity ? 'never' : expiration}`);

  const primaryFlagStates = [];
  for (const user of key.users || []) {
    const label = `Self-certification flags for "${user.userID?.userID || 'unnamed'}"`;
    primaryFlagStates.push(...reportSignatureFlags(label, user.selfCertifications));
  }

  const subkeys = typeof key.getSubkeys === 'function' ? key.getSubkeys() : key.subkeys || [];
  console.log(`\n=== SUBKEYS (${subkeys.length}) ===`);

  const subkeyFlagStates = [];
  if (subkeys.length === 0) {
    console.log('  none — encryption normally lives on a dedicated encryption subkey');
  }

  for (const [index, subkey] of subkeys.entries()) {
    const subAlgorithm = subkey.getAlgorithmInfo();
    console.log(`  [${index}] Fingerprint : ${subkey.getFingerprint().toUpperCase()}`);
    console.log(`      Algorithm   : ${subAlgorithm.algorithm} ${subAlgorithm.bits || ''}`);

    try {
      const subExpiry = await subkey.getExpirationTime();
      console.log(`      Expires     : ${subExpiry === Infinity ? 'never' : subExpiry}`);
    } catch {
      console.log('      Expires     : (could not determine)');
    }

    subkeyFlagStates.push(...reportSignatureFlags('    Binding signature', subkey.bindingSignatures));
  }

  console.log('\n=== ENCRYPTION CAPABILITY ===');

  let strictWorks = false;
  try {
    await openpgp.encrypt({
      message: await openpgp.createMessage({ text: 'probe' }),
      encryptionKeys: key,
    });
    strictWorks = true;
    console.log('  Default config          : encryption SUCCEEDED');
  } catch (error) {
    console.log(`  Default config          : REFUSED — ${error.message}`);
  }

  let lenientWorks = false;
  if (!strictWorks) {
    try {
      await openpgp.encrypt({
        message: await openpgp.createMessage({ text: 'probe' }),
        encryptionKeys: key,
        config: { allowMissingKeyFlags: true },
      });
      lenientWorks = true;
      console.log('  allowMissingKeyFlags    : encryption SUCCEEDED');
    } catch (error) {
      console.log(`  allowMissingKeyFlags    : REFUSED — ${error.message}`);
    }
  }

  const allStates = [...primaryFlagStates, ...subkeyFlagStates];
  const states = new Set(allStates.map((s) => s.state));
  const anyEncryptFlag = allStates.some((s) => s.canEncrypt);

  console.log('\n=== DIAGNOSIS ===');

  if (strictWorks) {
    console.log('  Key is fine. Encryption flags are set correctly and no workaround is needed.');
  } else if (anyEncryptFlag) {
    console.log('  Encryption flags ARE present somewhere but encryption still failed.');
    console.log('  Look for an expired or revoked encryption subkey above.');
  } else if (states.has('ZERO') || states.has('ZERO_LENGTH')) {
    console.log('  CASE B — Key Flags are present but assert no capabilities.');
    console.log('  This key is unusable by GnuPG too, not just by strict libraries.');
    console.log('  Unambiguously a sender-side generation fault. Request a reissue.');
  } else if (states.has('ABSENT') || states.size === 0) {
    console.log('  CASE A — no Key Flags subpacket at all.');
    console.log('  RFC 4880 permits this and GnuPG infers usage from the algorithm, so the');
    console.log('  key likely appears to work on the sender side. Strict implementations');
    console.log('  refuse it because intended usage is never asserted.');
    console.log(`  Encryption with allowMissingKeyFlags: ${lenientWorks ? 'works' : 'still fails'}.`);
    console.log('  Ask for a reissue with explicit flags; treat the flag as a stopgap only.');
  } else {
    console.log('  CASE C — flags are set, but not for encryption.');
    console.log('  A signing-only key was issued. Request an encryption-capable key.');
  }

  console.log('\n  Sender-side check they can run: gpg --edit-key <keyid> then "showpref",');
  console.log('  or: gpg --list-keys --with-subkey-fingerprint (look for an [E] subkey).');
})().catch((error) => {
  console.error(`\nScript error: ${error.message}`);
  process.exitCode = 1;
});
