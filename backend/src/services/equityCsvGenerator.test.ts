import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  EQUITY_CSV_HEADERS,
  generateEquityMwBatchFile,
  type EquityBatchFileConfig,
  type EquityMwPaymentLine,
} from './equityCsvGenerator';
import {
  getEastAfricaTimeParts,
  getEquityCountryConfig,
  getUgandaServiceProvider,
  normalizeUgandaMobile,
} from './equityCountryConfig';

const UG_CONFIG: EquityBatchFileConfig = {
  country: 'UG',
  templateId: 'TMP224',
  customerId: '56010646936',
  debitAccountNo: '1003200930075',
  generatedAt: new Date('2026-11-06T12:47:19Z'),
};

const UG_LINES: EquityMwPaymentLine[] = [
  {
    bankTransactionId: '11111111-1111-1111-1111-111111111111',
    beneficiaryName: 'UG UAT AIRTEL WALLET',
    beneficiaryMobileNo: '0751000000',
    amount: 5000,
  },
  {
    bankTransactionId: '22222222-2222-2222-2222-222222222222',
    beneficiaryName: 'MTN UAT TEST WALLET',
    beneficiaryMobileNo: '0782000000',
    amount: 5000,
  },
];

function ugLine(i: number): EquityMwPaymentLine {
  return {
    bankTransactionId: `line-${i}`,
    beneficiaryName: `Farmer ${i}`,
    beneficiaryMobileNo: '0751000000',
    amount: 100,
  };
}

test('Uganda batch matches the format Equity accepted in UAT', () => {
  const out = generateEquityMwBatchFile(UG_CONFIG, UG_LINES);

  assert.equal(
    out.filename,
    'TMP224_56010646936_56010646936_MD_06112026_DRAPIUSUG_ALL20261106154719.csv'
  );
  assert.ok(out.content.endsWith('\r\n'), 'trailing CRLF');
  const lines = out.content.split('\r\n');
  assert.equal(lines.length, 4, 'header + 2 data lines + empty after trailing CRLF');
  assert.equal(lines[0], EQUITY_CSV_HEADERS.join(','));
  assert.equal(
    lines[1],
    'MW,1003200930075,,UG UAT AIRTEL WALLET,,,,UGX,5000,,0751000000,AIRTELMONEY-UG,OUR,06-11-2026,DU2026110615471901,'
  );
  assert.equal(
    lines[2],
    'MW,1003200930075,,MTN UAT TEST WALLET,,,,UGX,5000,,0782000000,MTNUG,OUR,06-11-2026,DU2026110615471902,'
  );
  assert.deepEqual(out.customerReferences, ['DU2026110615471901', 'DU2026110615471902']);
  assert.equal(out.valueDateFormatted, '06-11-2026');
  assert.equal(out.sequenceNo, null);
});

test('Uganda date uses Africa/Kampala: 21:30Z rolls over to the next day', () => {
  const out = generateEquityMwBatchFile(
    { ...UG_CONFIG, generatedAt: new Date('2026-11-06T21:30:00Z') },
    UG_LINES
  );
  assert.equal(out.valueDateFormatted, '07-11-2026');
  assert.ok(out.filename.includes('_MD_07112026_DRAPIUSUG_ALL20261107003000.csv'), out.filename);
  assert.equal(out.rows[0]['Value Date'], '07-11-2026');
  assert.equal(out.customerReferences[0], 'DU2026110700300001');

  assert.deepEqual(getEastAfricaTimeParts(new Date('2026-11-06T21:30:00Z')), {
    day: 7,
    month: 11,
    year: 2026,
    hour: 0,
    minute: 30,
    second: 0,
  });
});

test('Uganda mobile normalisation accepts every supported form', () => {
  for (const input of ['+256751000000', '256751000000', '0751000000', '751000000']) {
    assert.equal(normalizeUgandaMobile(input), '0751000000', input);
  }
  assert.throws(() => normalizeUgandaMobile('75100000'), /9 digits/);
  assert.throws(() => normalizeUgandaMobile('07510000000'), /9 digits/);
  assert.throws(() => normalizeUgandaMobile(''), /9 digits/);
});

test('Uganda provider is chosen by network prefix; unknown prefix throws', () => {
  for (const prefix of ['070', '074', '075']) {
    assert.equal(getUgandaServiceProvider(`${prefix}1000000`), 'AIRTELMONEY-UG');
  }
  for (const prefix of ['076', '077', '078']) {
    assert.equal(getUgandaServiceProvider(`${prefix}1000000`), 'MTNUG');
  }
  assert.throws(() => getUgandaServiceProvider('0791000000'), /Unknown Uganda mobile network prefix "079"/);
  assert.throws(() => getUgandaServiceProvider('+256391000000'), /Unknown Uganda mobile network prefix "039"/);
  assert.throws(
    () =>
      generateEquityMwBatchFile(UG_CONFIG, [{ ...UG_LINES[0], beneficiaryMobileNo: '0791000000' }]),
    /Unknown Uganda mobile network prefix/
  );
});

test('Uganda entity code comes from EQUITY_UG_ENTITY_CODE, defaulting to DRAPIUSUG', () => {
  const original = process.env.EQUITY_UG_ENTITY_CODE;
  try {
    delete process.env.EQUITY_UG_ENTITY_CODE;
    assert.deepEqual(
      (({ currency, entityCode, filenameStyle, referencePrefix }) => ({
        currency,
        entityCode,
        filenameStyle,
        referencePrefix,
      }))(getEquityCountryConfig('UG')),
      { currency: 'UGX', entityCode: 'DRAPIUSUG', filenameStyle: 'timestamp', referencePrefix: 'DU' }
    );

    process.env.EQUITY_UG_ENTITY_CODE = 'CUSTOMUG';
    assert.equal(getEquityCountryConfig('UG').entityCode, 'CUSTOMUG');
    assert.ok(generateEquityMwBatchFile(UG_CONFIG, UG_LINES).filename.includes('_CUSTOMUG_ALL'));
  } finally {
    if (original === undefined) delete process.env.EQUITY_UG_ENTITY_CODE;
    else process.env.EQUITY_UG_ENTITY_CODE = original;
  }
});

test('Uganda file allows 99 lines but rejects 100', () => {
  const ok = generateEquityMwBatchFile(
    UG_CONFIG,
    Array.from({ length: 99 }, (_, i) => ugLine(i))
  );
  assert.equal(ok.customerReferences[98], 'DU2026110615471999');
  assert.equal(new Set(ok.customerReferences).size, 99);

  assert.throws(
    () =>
      generateEquityMwBatchFile(
        UG_CONFIG,
        Array.from({ length: 100 }, (_, i) => ugLine(i))
      ),
    /at most 99 lines/
  );
});

test('Kenya batch still produces KES, MPESA and sequence-number filename', () => {
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

  assert.equal(out.filename, 'TMP224_56010646936_56010646936_MD_17092026_DRAPIUS_001.csv');
  assert.equal(out.valueDateFormatted, '17-09-2026');
  assert.equal(out.sequenceNo, 1);
  assert.ok(out.content.endsWith('\r\n'));

  const fields = out.content.trimEnd().split('\r\n')[1].split(',');
  assert.equal(fields.length, 16);
  assert.equal(fields[0], 'MW');
  assert.equal(fields[1], '012345677777');
  assert.equal(fields[3], 'Amos Wanje');
  assert.equal(fields[7], 'KES');
  assert.equal(fields[8], '100');
  assert.equal(fields[10], '254722000000');
  assert.equal(fields[11], 'MPESA');
  assert.equal(fields[12], 'OUR');
  assert.equal(fields[13], '17-09-2026');
  assert.equal(fields[14].length, 12, 'opaque Kenya customer reference');
  assert.equal(fields[15], '');

  assert.deepEqual(getEquityCountryConfig('KE'), {
    country: 'KE',
    currency: 'KES',
    entityCode: null,
    filenameStyle: 'sequence',
    referencePrefix: null,
    fixedServiceProvider: 'MPESA',
  });
});
