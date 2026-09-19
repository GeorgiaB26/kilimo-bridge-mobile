/**
 * Prove Equity ACK/NACK/PSR parsers against checked-in sample fixtures.
 * Run from backend/: npx tsx scripts/prove-equity-response-parsers.ts
 */
import fs from 'fs';
import path from 'path';
import {
  indexNackByCustomerReference,
  indexPsrByCustomerReference,
  parseEquityAck,
  parseEquityNack,
  parseEquityPsr,
  parseEquityResponseFile,
} from '../src/services/equityResponseParsers';

const samplesDir = path.resolve(__dirname, '../data/equity_samples');

function read(name: string): string {
  return fs.readFileSync(path.join(samplesDir, name), 'utf8');
}

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

function main(): void {
  const ackName =
    'ACK__56010646936_56010646936_TMP224_56010646936_56010646936_MD_17092026_DRAPIUS_001.csv';
  const nackName =
    'NACK__56010646936_56010646936_TMP224_56010646936_56010646936_MD_17092026_DRAPIUS_001.csv';
  const psrName =
    'PSR_56010646936_56010646936_TMP224_56010646936_56010646936_MD_17092026_DRAPIUS_001.csv';

  const ack = parseEquityAck(read(ackName));
  assert(ack.statusCode === 'ACPT', `ACK status ${ack.statusCode}`);
  assert(ack.fileReference.startsWith('H2H'), 'ACK file reference');
  assert(
    parseEquityResponseFile(ackName, read(ackName)).kind === 'ack',
    'detect ACK'
  );
  console.log('ACK OK', ack.fileReference, ack.message);

  const nack = parseEquityNack(read(nackName));
  assert(nack.summary.statusCode === 'RJCT', 'NACK summary RJCT');
  assert(nack.summary.rawFieldCount >= 16, `NACK summary arity ${nack.summary.rawFieldCount}`);
  assert(nack.records.length === 6, `NACK records ${nack.records.length}`);
  assert(
    nack.records.every((r) => r.fileReference === nack.summary.fileReference),
    'NACK record file refs match summary'
  );
  const multi = nack.records.find((r) => r.customerReference === '71');
  assert(multi && multi.errorMessages.length === 2, 'pipe-delimited errors on ref 71');
  const byRef = indexNackByCustomerReference(nack);
  assert((byRef.get('72')?.length ?? 0) === 2, 'customer ref 72 appears twice — match by ref not position');
  console.log('NACK OK', nack.summary.summaryMessage, `${nack.records.length} records`);

  const psr = parseEquityPsr(read(psrName));
  assert(psr.records.length === 6, `PSR records ${psr.records.length}`);
  const success = psr.records.filter((r) => r.status === 'success');
  const failed = psr.records.filter((r) => r.status === 'verification_failure');
  assert(success.length === 5, `expected 5 successes, got ${success.length}`);
  assert(failed.length === 1, `expected 1 verification failure, got ${failed.length}`);
  assert(
    success.every((r) => r.errorDescription === 'Success' || r.errorDescription === ''),
    'successful rows may carry Error Description = Success — Status is authoritative'
  );
  assert(failed[0].errorCode === 'VERFAL', 'failure error code');
  assert(success.every((r) => r.errorMessages.length === 0), 'no pipe-split on success rows');
  const psrByRef = indexPsrByCustomerReference(psr);
  assert((psrByRef.get('72')?.length ?? 0) === 2, 'PSR duplicate customer refs indexed');
  console.log('PSR OK', `${success.length} success / ${failed.length} failure`);

  console.log('\nRESULT: all Equity response parsers passed against sample fixtures.');
}

main();
