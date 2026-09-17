/**
 * One-off diagnostic: validate the PGP key pair used for the bank file exchange.
 *
 * Not application code. Not imported by the backend. Intended to be fetched into
 * a scratch directory, run once, and deleted.
 *
 * All partner-specific values come from the environment so that nothing
 * identifying the integration lives in this (public) repository.
 *
 * Required env:
 *   EQUITY_PGP_PRIVATE_KEY_PATH   our own armoured private key (secret file)
 *   EQUITY_PGP_PASSPHRASE         passphrase for the above
 *   EQUITY_BANK_PUBLIC_KEY_PATH   the bank's armoured public key (secret file)
 * Optional env:
 *   EXPECTED_PGP_FINGERPRINT      fingerprint we published, hex, spaces ignored
 *
 * Requires: npm install openpgp@^6
 */

const fs = require('fs');

const ourPath = process.env.EQUITY_PGP_PRIVATE_KEY_PATH;
const theirPath = process.env.EQUITY_BANK_PUBLIC_KEY_PATH;
const passphrase = process.env.EQUITY_PGP_PASSPHRASE;
const expectedFingerprint = (process.env.EXPECTED_PGP_FINGERPRINT || '')
  .replace(/[^0-9a-fA-F]/g, '')
  .toUpperCase();

const pretty = (fp) => fp.toUpperCase().match(/.{1,4}/g).join(' ');

let failed = false;
const fail = (message) => {
  console.error(`  FAIL: ${message}`);
  failed = true;
};

async function checkOurKey(openpgp) {
  console.log('=== OUR KEY (private — decrypts what the bank sends us) ===');

  if (!ourPath) {
    fail('EQUITY_PGP_PRIVATE_KEY_PATH is not set in this shell');
    return;
  }
  if (!fs.existsSync(ourPath)) {
    fail(`no file at ${ourPath}`);
    return;
  }

  const armored = fs.readFileSync(ourPath, 'utf8');
  console.log(`  Path         : ${ourPath}`);
  console.log(`  First line   : ${armored.split('\n')[0]}`);

  if (!/PRIVATE KEY BLOCK/.test(armored)) {
    fail('this file is not a PGP PRIVATE KEY BLOCK');
    return;
  }

  const key = await openpgp.readPrivateKey({ armoredKey: armored });
  const fingerprint = key.getFingerprint().toUpperCase();
  const algorithm = key.getAlgorithmInfo();

  console.log(`  Fingerprint  : ${pretty(fingerprint)}`);
  console.log(`  Algorithm    : ${algorithm.algorithm} ${algorithm.bits || ''}`);
  console.log(`  User IDs     : ${key.getUserIDs().join(', ')}`);

  const expiration = await key.getExpirationTime();
  console.log(`  Expires      : ${expiration === Infinity ? 'never' : expiration}`);
  if (expiration !== Infinity && expiration < new Date()) {
    fail('our key has EXPIRED — the bank can no longer encrypt to it');
  }

  if (!expectedFingerprint) {
    console.log('  (set EXPECTED_PGP_FINGERPRINT to assert this matches the published key)');
  } else if (fingerprint !== expectedFingerprint) {
    fail(
      `fingerprint mismatch — expected ${pretty(expectedFingerprint)}. ` +
        'The bank holds a different key than this service does.'
    );
  } else {
    console.log('  Fingerprint matches the published key. OK');
  }

  if (!passphrase) {
    fail('EQUITY_PGP_PASSPHRASE is not set — cannot prove the key can be unlocked');
    return;
  }

  // A wrong passphrase stays invisible until the first real decryption, so prove
  // it now with a full encrypt/decrypt round trip against our own key.
  try {
    const unlocked = await openpgp.decryptKey({ privateKey: key, passphrase });
    console.log('  Passphrase   : unlocks the key. OK');

    const probe = 'kilimo-bridge round trip';
    const encrypted = await openpgp.encrypt({
      message: await openpgp.createMessage({ text: probe }),
      encryptionKeys: unlocked.toPublic(),
    });
    const { data } = await openpgp.decrypt({
      message: await openpgp.readMessage({ armoredMessage: encrypted }),
      decryptionKeys: unlocked,
    });
    console.log(`  Round trip   : ${data === probe ? 'encrypt + decrypt OK' : 'MISMATCH'}`);
    if (data !== probe) fail('round trip returned different plaintext');
  } catch (error) {
    fail(`passphrase did not unlock the key (${error.message})`);
  }
}

async function checkTheirKey(openpgp) {
  console.log("\n=== BANK'S KEY (public — encrypts what we send them) ===");

  if (!theirPath) {
    fail('EQUITY_BANK_PUBLIC_KEY_PATH is not set in this shell');
    return;
  }
  if (!fs.existsSync(theirPath)) {
    fail(`no file at ${theirPath} — add the secret file first`);
    return;
  }

  const armored = fs.readFileSync(theirPath, 'utf8');
  console.log(`  Path         : ${theirPath}`);
  console.log(`  First line   : ${armored.split('\n')[0]}`);

  if (/PRIVATE KEY BLOCK/.test(armored)) {
    fail(
      'this is a PRIVATE key — the bank sent the wrong half. Report it to them; ' +
        'that key must be treated as compromised and reissued.'
    );
    return;
  }

  const key = await openpgp.readKey({ armoredKey: armored });
  const algorithm = key.getAlgorithmInfo();

  console.log(`  Fingerprint  : ${pretty(key.getFingerprint())}`);
  console.log('                 ^ confirm this with the bank by phone, not by email');
  console.log(`  Key ID       : ${key.getKeyID().toHex().toUpperCase()}`);
  console.log(`  Algorithm    : ${algorithm.algorithm} ${algorithm.bits || ''}`);
  console.log(`  User IDs     : ${key.getUserIDs().join(', ')}`);

  const expiration = await key.getExpirationTime();
  console.log(`  Expires      : ${expiration === Infinity ? 'never' : expiration}`);
  if (expiration !== Infinity && expiration < new Date()) {
    fail('their key has EXPIRED — request a current one before sending files');
  }

  try {
    await openpgp.encrypt({
      message: await openpgp.createMessage({ text: 'test' }),
      encryptionKeys: key,
    });
    console.log('  Encrypt test : we can encrypt to their key. OK');
  } catch (error) {
    fail(`cannot encrypt to their key (${error.message})`);
  }
}

(async () => {
  const openpgp = await import('openpgp');

  await checkOurKey(openpgp);
  await checkTheirKey(openpgp);

  console.log(
    failed
      ? '\nRESULT: PROBLEMS FOUND — see the FAIL lines above.'
      : '\nRESULT: both keys are valid and usable.'
  );
  process.exitCode = failed ? 1 : 0;
})().catch((error) => {
  console.error(`\nRESULT: script error — ${error.message}`);
  process.exitCode = 1;
});
