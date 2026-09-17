# Bank integration diagnostics (one-off)

Throwaway scripts for verifying the bank file-exchange integration from inside a
**deployed** Render service, where the outbound IP is one the bank has allowlisted.
Running them from a laptop proves nothing.

These are **not application code**. Nothing in `backend/` or `mobile/` imports them,
they are never built or deployed, and they live on this branch only so they can be
fetched with `curl` (the Render Shell paste buffer truncates long heredocs).

They are deliberately free of any partner-specific values — hosts, ports,
credentials, and fingerprints are all supplied through the environment at run time,
because this repository is public.

## `validate-pgp.js`

Checks that our own private key loads, matches the fingerprint we published, and is
genuinely unlocked by its passphrase (via an encrypt/decrypt round trip), and that
the partner's public key loads, has not expired, and can be encrypted to.

```bash
npm install openpgp@^6
EXPECTED_PGP_FINGERPRINT=<our published fingerprint> node validate-pgp.js
```

Reads `EQUITY_PGP_PRIVATE_KEY_PATH`, `EQUITY_PGP_PASSPHRASE`, and
`EQUITY_BANK_PUBLIC_KEY_PATH` from the service environment.

## `test-sftp.js`

Authenticates over SFTP and lists one remote directory. Read-only — no uploads,
writes, or deletes. Prints the server's SHA256 host key fingerprint so it can be
pinned later, and never prints the password.

```bash
npm install ssh2-sftp-client
EQUITY_SFTP_HOST=<host> EQUITY_SFTP_PORT=<port> node test-sftp.js
```

Reads `EQUITY_SFTP_USERNAME` and `EQUITY_SFTP_PASSWORD` from the service environment.

**Partner SFTP accounts commonly lock after a few failed authentications.** Budget two
or three attempts, and diagnose rather than retry on failure.

## Usage

```bash
mkdir -p /tmp/equity-check && cd /tmp/equity-check
npm init -y
npm install ssh2-sftp-client 'openpgp@^6' --no-audit --no-fund
# fetch the two scripts, run them, then:
cd / && rm -rf /tmp/equity-check
```
