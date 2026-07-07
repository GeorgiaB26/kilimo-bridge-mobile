#!/usr/bin/env node
/**
 * Quick backend diagnostic — run from project root:
 *   node scripts/test-backend.js
 */
const { execSync, spawn } = require('child_process');
const http = require('http');
const path = require('path');

const backendDir = path.join(__dirname, '..', 'backend');

function check(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    return true;
  } catch (err) {
    console.log(`  ✗ ${name}`);
    console.log(`    ${err.message}`);
    return false;
  }
}

console.log('\n=== Backend diagnostic ===\n');

let ok = true;

ok = check('Node.js', () => {
  console.log(`    version: ${process.version}`);
}) && ok;

ok = check('backend/package.json exists', () => {
  require(path.join(backendDir, 'package.json'));
}) && ok;

process.chdir(backendDir);

ok = check('npm dependencies installed', () => {
  require.resolve('express');
  require.resolve('helmet');
  require.resolve('express-rate-limit');
  require.resolve('bcryptjs');
}) && ok;

ok = check('better-sqlite3 (native module)', () => {
  require('better-sqlite3');
}) && ok;

ok = check('database init', () => {
  // Run via tsx since it's TypeScript
  execSync('npx tsx -e "import { initDatabase } from \'./src/db/database\'; initDatabase();"', {
    cwd: backendDir,
    stdio: 'pipe',
  });
}) && ok;

console.log('\n--- Port 3001 ---');
const portInUse = execSync('lsof -ti:3001 2>/dev/null || true', { encoding: 'utf8' }).trim();
if (portInUse) {
  console.log(`  ✓ Something listening (PID ${portInUse})`);
  try {
    const data = execSync('curl -sf http://localhost:3001/health', { encoding: 'utf8', timeout: 3000 });
    console.log(`  ✓ Health: ${data}`);
  } catch {
    console.log('  ✗ Port in use but /health not responding');
    ok = false;
  }
} else {
  console.log('  ✗ Nothing on port 3001 — backend not running');
  console.log('\n  Start it with:  bash scripts/start-backend.sh');
  ok = false;
}

console.log(ok ? '\n=== All checks passed ===\n' : '\n=== Fix the ✗ items above ===\n');
process.exit(ok ? 0 : 1);
