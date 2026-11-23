/** Guard: a Render blueprint sync must never turn the pilot login (fixed OTP, dev-login) back on. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

function readRepoFile(...parts: string[]): string {
  return readFileSync(path.resolve(__dirname, '..', '..', ...parts), 'utf8');
}

test('render.yaml sets PILOT_OTP to "false" for production', () => {
  const yaml = readRepoFile('render.yaml');
  const match = /-\s*key:\s*PILOT_OTP\s*\n\s*value:\s*"?([^"\n]+)"?/.exec(yaml);
  assert.ok(match, 'render.yaml must pin PILOT_OTP explicitly');
  assert.equal(match[1].trim(), 'false');
});

test('backend/.env.example does not default PILOT_OTP to true', () => {
  const env = readRepoFile('backend', '.env.example');
  const match = /^PILOT_OTP=(.*)$/m.exec(env);
  assert.ok(match);
  assert.equal(match[1].trim(), 'false');
});
