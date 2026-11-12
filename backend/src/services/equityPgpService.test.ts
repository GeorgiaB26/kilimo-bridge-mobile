import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import * as openpgp from 'openpgp';
import { decryptEquityResponse } from './equityPgpService';

const PASSPHRASE = 'correct horse battery staple';
const PLAINTEXT = 'Transaction ID,Status\nBT1,Success\n';

async function makeKey(passphrase?: string) {
  return openpgp.generateKey({
    type: 'ecc',
    curve: 'curve25519',
    userIDs: [{ name: 'Kilimo Test', email: 'test@example.test' }],
    passphrase,
    format: 'armored',
  });
}

function withEnv<T>(vars: Record<string, string | undefined>, fn: () => Promise<T>): Promise<T> {
  const saved: Record<string, string | undefined> = {};
  for (const k of Object.keys(vars)) {
    saved[k] = process.env[k];
    if (vars[k] === undefined) delete process.env[k];
    else process.env[k] = vars[k];
  }
  return fn().finally(() => {
    for (const k of Object.keys(saved)) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });
}

function tmpKeyFile(contents: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'equity-pgp-test-'));
  const file = path.join(dir, 'key.asc');
  fs.writeFileSync(file, contents, { mode: 0o600 });
  return file;
}

async function encryptTo(publicKey: string, format: 'armored' | 'binary'): Promise<Buffer> {
  const out = await openpgp.encrypt({
    message: await openpgp.createMessage({ binary: Buffer.from(PLAINTEXT, 'utf8') }),
    encryptionKeys: await openpgp.readKey({ armoredKey: publicKey }),
    format,
  });
  return typeof out === 'string' ? Buffer.from(out) : Buffer.from(out as Uint8Array);
}

test('decryptEquityResponse: armoured message, protected key', async () => {
  const { privateKey, publicKey } = await makeKey(PASSPHRASE);
  const keyPath = tmpKeyFile(privateKey);
  const out = await withEnv(
    { EQUITY_PGP_PRIVATE_KEY_PATH: keyPath, EQUITY_PGP_PASSPHRASE: PASSPHRASE },
    async () => decryptEquityResponse(await encryptTo(publicKey, 'armored'))
  );
  assert.equal(out.toString('utf8'), PLAINTEXT);
});

test('decryptEquityResponse: binary message', async () => {
  const { privateKey, publicKey } = await makeKey(PASSPHRASE);
  const keyPath = tmpKeyFile(privateKey);
  const binary = await encryptTo(publicKey, 'binary');
  assert.ok(!binary.toString('latin1').startsWith('-----BEGIN'));
  const out = await withEnv(
    { EQUITY_PGP_PRIVATE_KEY_PATH: keyPath, EQUITY_PGP_PASSPHRASE: PASSPHRASE },
    async () => decryptEquityResponse(binary)
  );
  assert.equal(out.toString('utf8'), PLAINTEXT);
});

test('decryptEquityResponse: a key without a passphrase needs none', async () => {
  const { privateKey, publicKey } = await makeKey();
  const keyPath = tmpKeyFile(privateKey);
  const out = await withEnv(
    { EQUITY_PGP_PRIVATE_KEY_PATH: keyPath, EQUITY_PGP_PASSPHRASE: undefined },
    async () => decryptEquityResponse(await encryptTo(publicKey, 'armored'))
  );
  assert.equal(out.toString('utf8'), PLAINTEXT);
});

test('decryptEquityResponse: configuration errors are clear and leak nothing', async () => {
  await assert.rejects(
    () => withEnv({ EQUITY_PGP_PRIVATE_KEY_PATH: undefined }, () => decryptEquityResponse(Buffer.from('x'))),
    /EQUITY_PGP_PRIVATE_KEY_PATH is not set/
  );
  await assert.rejects(
    () =>
      withEnv({ EQUITY_PGP_PRIVATE_KEY_PATH: '/nonexistent/key.asc' }, () =>
        decryptEquityResponse(Buffer.from('x'))
      ),
    /Could not read the file at EQUITY_PGP_PRIVATE_KEY_PATH/
  );

  const { privateKey, publicKey } = await makeKey(PASSPHRASE);
  const keyPath = tmpKeyFile(privateKey);
  const message = await encryptTo(publicKey, 'armored');

  // Protected key but no passphrase.
  await assert.rejects(
    () =>
      withEnv({ EQUITY_PGP_PRIVATE_KEY_PATH: keyPath, EQUITY_PGP_PASSPHRASE: undefined }, () =>
        decryptEquityResponse(message)
      ),
    /EQUITY_PGP_PASSPHRASE is not set/
  );

  // Wrong passphrase: the error must not contain it, or any key material.
  const wrong = 'wrong-passphrase-123';
  await assert.rejects(
    () =>
      withEnv({ EQUITY_PGP_PRIVATE_KEY_PATH: keyPath, EQUITY_PGP_PASSPHRASE: wrong }, () =>
        decryptEquityResponse(message)
      ),
    (err: Error) => {
      assert.match(err.message, /^Equity response decryption failed:/);
      assert.ok(!err.message.includes(wrong));
      assert.ok(!err.message.includes(PASSPHRASE));
      assert.ok(!err.message.includes('PRIVATE KEY'));
      return true;
    }
  );
});

test('decryptEquityResponse: a message for another key, or garbage, fails cleanly', async () => {
  const mine = await makeKey(PASSPHRASE);
  const other = await makeKey();
  const keyPath = tmpKeyFile(mine.privateKey);
  const env = { EQUITY_PGP_PRIVATE_KEY_PATH: keyPath, EQUITY_PGP_PASSPHRASE: PASSPHRASE };

  await assert.rejects(
    async () => withEnv(env, async () => decryptEquityResponse(await encryptTo(other.publicKey, 'armored'))),
    /Equity response decryption failed/
  );
  await assert.rejects(
    () => withEnv(env, () => decryptEquityResponse(Buffer.from('not a pgp message'))),
    (err: Error) => {
      assert.match(err.message, /Equity response decryption failed/);
      assert.ok(!err.message.includes(PASSPHRASE));
      return true;
    }
  );
});
