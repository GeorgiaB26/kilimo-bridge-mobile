import { pickWinner, mergeFarmerRows, shouldQueueOffline } from '../syncLogic';

let passed = 0;
let failed = 0;

function assert(name: string, condition: boolean): void {
  if (condition) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ ${name}`);
  }
}

console.log('syncLogic tests');

assert('remote wins when local missing', pickWinner(null, '2025-01-01T00:00:00Z') === 'remote-wins');
assert('local wins when newer', pickWinner('2025-06-01T00:00:00Z', '2025-01-01T00:00:00Z') === 'local-wins');
assert('remote wins when newer', pickWinner('2025-01-01T00:00:00Z', '2025-06-01T00:00:00Z') === 'remote-wins');

const merged = mergeFarmerRows(
  { name: 'Local', updated_at: '2025-06-01T00:00:00Z' },
  { name: 'Remote', updated_at: '2025-01-01T00:00:00Z' }
);
assert('merge keeps newer local', merged.row?.name === 'Local');

assert('queue when offline', shouldQueueOffline(false, 'hybrid') === true);
assert('no queue in api mode', shouldQueueOffline(false, 'api') === false);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
