#!/usr/bin/env node
/** Ensure backend dependencies are installed before starting. */
const { execSync } = require('child_process');
const path = require('path');

const required = [
  'helmet',
  'express-rate-limit',
  'bcryptjs',
  'better-sqlite3',
  'express',
  'tsx',
];

const backendRoot = path.join(__dirname, '..');
const missing = [];

for (const mod of required) {
  try {
    require.resolve(mod, { paths: [backendRoot] });
  } catch {
    missing.push(mod);
  }
}

if (missing.length > 0) {
  console.log('');
  console.log('Installing missing backend packages:', missing.join(', '));
  console.log('');
  execSync('npm install', { cwd: backendRoot, stdio: 'inherit' });
}
