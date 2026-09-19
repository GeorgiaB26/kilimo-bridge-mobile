/**
 * Prove MW CSV generator shape against Equity sample conventions.
 * Run from backend/: npx tsx scripts/prove-equity-csv-generator.ts
 */
import {
  EQUITY_CSV_HEADERS,
  generateEquityMwBatchFile,
} from '../src/services/equityCsvGenerator';

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

const out = generateEquityMwBatchFile(
  {
    templateId: 'TMP224',
    customerId: '56010646936',
    entityCode: 'DRAPIUS',
    debitAccountNo: '012345677777',
    valueDate: new Date(2026, 8, 17),
    sequenceNo: 1,
  },
  [
    {
      bankTransactionId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      beneficiaryName: 'Amos Wanje',
      beneficiaryMobileNo: '+254722000000',
      amount: 100,
    },
  ]
);

assert(
  out.filename === 'TMP224_56010646936_56010646936_MD_17092026_DRAPIUS_001.csv',
  `filename ${out.filename}`
);
assert(out.content.includes('\r\n'), 'CRLF required');
assert(out.content.startsWith(EQUITY_CSV_HEADERS.join(',')), 'header order');
const dataLine = out.content.trimEnd().split('\r\n')[1];
const fields = dataLine.split(',');
assert(fields.length === 16, `field count ${fields.length}`);
assert(fields[0] === 'MW', 'MW transaction type');
assert(fields[11] === 'MPESA', 'MPESA provider');
assert(fields[8] === '100', 'integer amount');
assert(fields[5] === '', 'Purpose Code blank for MW pending Equity confirmation');
assert(out.customerReferences[0].length === 12, 'opaque customer reference length');

console.log('RESULT: equity CSV generator OK —', out.filename);
