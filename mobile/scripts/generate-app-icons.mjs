/**
 * Generate Kilimo Bridge app icons from the circular KB mark
 * (assets/kilimo-logo.png). Uses Python/Pillow because sharp is not
 * reliably available on this machine.
 *
 * Run: npm run generate-icons
 *   or: python3 scripts/generate-app-icons.py
 */
import { spawnSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const script = path.join(__dirname, 'generate-app-icons.py');
const result = spawnSync('python3', [script], { stdio: 'inherit' });
process.exit(result.status ?? 1);
