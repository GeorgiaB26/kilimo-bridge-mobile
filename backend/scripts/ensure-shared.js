#!/usr/bin/env node
/** Render builds from backend/ but needs ../shared for TypeScript. */
const fs = require('fs');
const path = require('path');

const sharedDir = path.join(__dirname, '..', '..', 'shared', 'src');
if (!fs.existsSync(sharedDir)) {
  console.error('');
  console.error('ERROR: shared/src not found at', sharedDir);
  console.error('Render must clone the full repo. Set Root Directory to "backend" (not a subfolder export).');
  console.error('');
  process.exit(1);
}

console.log('shared/src OK');
