/**
 * Equity Bank PGP helpers — encrypt outbound files to Equity's public key.
 *
 * Policy (agreed with product/security for this integration):
 * - allowMissingKeyFlags is scoped ONLY to encrypting with Equity's known key
 *   (Case A: RFC-optional Key Flags absent; Bouncy Castle / bank tooling).
 * - On every use we still fail hard unless:
 *     • fingerprint matches EQUITY_BANK_PGP_FINGERPRINT (when set),
 *     • an encryption-capable subkey/primary exists (or lenient path after shape checks),
 *     • RSA modulus (or equivalent) is at least 2048 bits (prefer 4096).
 */

import fs from 'fs';
import * as openpgp from 'openpgp';

const MIN_RSA_BITS = 2048;

export type EquityPublicKeyInfo = {
  fingerprint: string;
  keyId: string;
  userIds: string[];
  primaryBits: number | null;
  encryptionKeyBits: number | null;
  algorithm: string;
};

export type EncryptForEquityResult = {
  /** ASCII-armored ciphertext (default). */
  armoredMessage: string;
  keyInfo: EquityPublicKeyInfo;
};

function normalizeFingerprint(fp: string): string {
  return fp.replace(/[^0-9a-fA-F]/g, '').toUpperCase();
}

function prettyFingerprint(fp: string): string {
  return normalizeFingerprint(fp).match(/.{1,4}/g)?.join(' ') ?? fp;
}

function keyPacketBits(key: openpgp.Key | openpgp.Subkey): number | null {
  const info = key.getAlgorithmInfo();
  const algo = String(info.algorithm || '').toLowerCase();
  if (typeof info.bits === 'number' && info.bits > 0) {
    return info.bits;
  }
  // ECC / unknown: no RSA modulus to measure — treat as non-RSA.
  if (algo.includes('rsa')) {
    return null;
  }
  return null;
}

/**
 * Load and validate Equity's public key from a Secret File path or armored string.
 * Throws if the key is too weak or fails shape checks.
 */
export async function loadAndValidateEquityPublicKey(options: {
  armoredKey?: string;
  keyPath?: string;
  /** Expected fingerprint (spaces ignored). Strongly recommended in production. */
  expectedFingerprint?: string;
}): Promise<{ key: openpgp.Key; info: EquityPublicKeyInfo }> {
  const armored =
    options.armoredKey ??
    (options.keyPath ? fs.readFileSync(options.keyPath, 'utf8') : undefined);

  if (!armored?.trim()) {
    throw new Error('Equity public key not provided (armoredKey or keyPath required)');
  }
  if (/PRIVATE KEY BLOCK/.test(armored)) {
    throw new Error('Refusing to load a PRIVATE key as Equity public key');
  }

  const key = await openpgp.readKey({ armoredKey: armored });
  const fingerprint = key.getFingerprint().toUpperCase();
  const expected = options.expectedFingerprint
    ? normalizeFingerprint(options.expectedFingerprint)
    : process.env.EQUITY_BANK_PGP_FINGERPRINT
      ? normalizeFingerprint(process.env.EQUITY_BANK_PGP_FINGERPRINT)
      : '';

  if (expected && fingerprint !== expected) {
    throw new Error(
      `Equity PGP fingerprint mismatch: got ${prettyFingerprint(fingerprint)}, expected ${prettyFingerprint(expected)}`
    );
  }

  const primaryBits = keyPacketBits(key);
  if (primaryBits !== null && primaryBits < MIN_RSA_BITS) {
    throw new Error(
      `Equity primary key is only ${primaryBits}-bit RSA (minimum ${MIN_RSA_BITS}). Refuse to encrypt.`
    );
  }

  const subkeys = key.getSubkeys();
  let encryptionKeyBits: number | null = null;
  let hasEncryptionCapablePacket = false;

  // Prefer an encryption subkey; fall back to primary if it can encrypt.
  for (const sub of subkeys) {
    const bits = keyPacketBits(sub);
    if (bits !== null && bits < MIN_RSA_BITS) {
      throw new Error(
        `Equity encryption subkey is only ${bits}-bit RSA (minimum ${MIN_RSA_BITS}). Refuse to encrypt.`
      );
    }
    encryptionKeyBits = bits ?? encryptionKeyBits;
    hasEncryptionCapablePacket = true;
  }

  if (!hasEncryptionCapablePacket) {
    // Primary-only keys: still require adequate RSA size when measurable.
    if (primaryBits !== null && primaryBits < MIN_RSA_BITS) {
      throw new Error(`Equity key has no usable encryption material ≥ ${MIN_RSA_BITS} bits`);
    }
    hasEncryptionCapablePacket = primaryBits === null || primaryBits >= MIN_RSA_BITS;
  }

  if (!hasEncryptionCapablePacket) {
    throw new Error('Equity public key is not encryption-capable');
  }

  // Prove encrypt works. Scoped exception: allowMissingKeyFlags ONLY here, after
  // fingerprint + size/shape checks above (Case A — Key Flags subpacket absent).
  try {
    await openpgp.encrypt({
      message: await openpgp.createMessage({ text: 'kilimo-bridge-key-probe' }),
      encryptionKeys: key,
      config: {
        // Documented exception: Equity's BCPG-issued key omits Key Flags (RFC-optional).
        // Do NOT enable this globally for other keys.
        allowMissingKeyFlags: true,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Equity public key failed encryption probe: ${msg}`);
  }

  const algo = key.getAlgorithmInfo();
  const info: EquityPublicKeyInfo = {
    fingerprint,
    keyId: key.getKeyID().toHex().toUpperCase(),
    userIds: key.getUserIDs(),
    primaryBits,
    encryptionKeyBits: encryptionKeyBits ?? primaryBits,
    algorithm: `${algo.algorithm}${algo.bits ? ` ${algo.bits}` : ''}`,
  };

  return { key, info };
}

export async function loadEquityPublicKeyFromEnv(): Promise<{
  key: openpgp.Key;
  info: EquityPublicKeyInfo;
}> {
  const keyPath = process.env.EQUITY_BANK_PUBLIC_KEY_PATH?.trim();
  if (!keyPath) {
    throw new Error('EQUITY_BANK_PUBLIC_KEY_PATH is not set');
  }
  return loadAndValidateEquityPublicKey({ keyPath });
}

/**
 * Encrypt plaintext (typically the outbound CSV) to Equity's validated public key.
 * Returns ASCII-armored ciphertext suitable for SFTP upload later.
 */
export async function encryptPayloadForEquity(
  plaintext: string | Uint8Array,
  options?: {
    armoredKey?: string;
    keyPath?: string;
    expectedFingerprint?: string;
    /** Optional filename hint embedded as OpenPGP literal data (not required by Equity). */
    filename?: string;
  }
): Promise<EncryptForEquityResult> {
  const { key, info } = await loadAndValidateEquityPublicKey({
    armoredKey: options?.armoredKey,
    keyPath: options?.keyPath ?? process.env.EQUITY_BANK_PUBLIC_KEY_PATH,
    expectedFingerprint: options?.expectedFingerprint,
  });

  if (info.encryptionKeyBits !== null && info.encryptionKeyBits < MIN_RSA_BITS) {
    throw new Error(
      `Refusing to encrypt: Equity encryption key is ${info.encryptionKeyBits}-bit (< ${MIN_RSA_BITS})`
    );
  }

  const message =
    typeof plaintext === 'string'
      ? await openpgp.createMessage({ text: plaintext, filename: options?.filename })
      : await openpgp.createMessage({ binary: plaintext, filename: options?.filename });

  const armoredMessage = await openpgp.encrypt({
    message,
    encryptionKeys: key,
    format: 'armored',
    config: {
      // Scoped documented exception — see loadAndValidateEquityPublicKey.
      allowMissingKeyFlags: true,
    },
  });

  if (typeof armoredMessage !== 'string') {
    throw new Error('Expected armored ciphertext string from openpgp.encrypt');
  }

  return { armoredMessage, keyInfo: info };
}
