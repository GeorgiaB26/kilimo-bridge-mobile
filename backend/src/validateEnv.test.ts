import assert from 'node:assert/strict';
import { afterEach, beforeEach, mock, test } from 'node:test';
import { DEV_JWT_SECRET_FALLBACK, validateProductionEnv } from './validateEnv';

const GOOD_JWT = 'a'.repeat(64);
const GOOD_ENC = 'b'.repeat(64);

let exits: number[] = [];
const exit = (code: number): void => {
  exits.push(code);
};

beforeEach(() => {
  exits = [];
  mock.method(console, 'error', () => {});
});

afterEach(() => {
  mock.restoreAll();
});

test('production with JWT_SECRET unset exits with code 1', () => {
  validateProductionEnv({ NODE_ENV: 'production', ENCRYPTION_KEY: GOOD_ENC }, exit);
  assert.deepEqual(exits, [1]);
});

test('production with JWT_SECRET empty or whitespace exits with code 1', () => {
  validateProductionEnv({ NODE_ENV: 'production', JWT_SECRET: '   ', ENCRYPTION_KEY: GOOD_ENC }, exit);
  assert.deepEqual(exits, [1]);
});

test('production with JWT_SECRET equal to the hardcoded fallback exits with code 1', () => {
  validateProductionEnv(
    { NODE_ENV: 'production', JWT_SECRET: DEV_JWT_SECRET_FALLBACK, ENCRYPTION_KEY: GOOD_ENC },
    exit
  );
  assert.deepEqual(exits, [1]);
});

test('production with a real JWT_SECRET does not exit', () => {
  validateProductionEnv({ NODE_ENV: 'production', JWT_SECRET: GOOD_JWT, ENCRYPTION_KEY: GOOD_ENC }, exit);
  assert.deepEqual(exits, []);
});

test('production with a weak (short) JWT_SECRET only warns, as before', () => {
  validateProductionEnv({ NODE_ENV: 'production', JWT_SECRET: 'short-secret', ENCRYPTION_KEY: GOOD_ENC }, exit);
  assert.deepEqual(exits, []);
});

test('production with a missing ENCRYPTION_KEY only warns, as before', () => {
  validateProductionEnv({ NODE_ENV: 'production', JWT_SECRET: GOOD_JWT }, exit);
  assert.deepEqual(exits, []);
});

test('non-production never exits, even with no JWT_SECRET', () => {
  validateProductionEnv({ NODE_ENV: 'development' }, exit);
  validateProductionEnv({}, exit);
  assert.deepEqual(exits, []);
});

test('the error output never contains the secret value', () => {
  const secret = 'x'.repeat(20);
  const seen: string[] = [];
  mock.restoreAll();
  mock.method(console, 'error', (...args: unknown[]) => {
    seen.push(args.map(String).join(' '));
  });
  validateProductionEnv({ NODE_ENV: 'production', JWT_SECRET: secret, ENCRYPTION_KEY: GOOD_ENC }, exit);
  assert.ok(!seen.join('\n').includes(secret));
});
