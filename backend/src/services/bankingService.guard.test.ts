import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Pool } from 'pg';

// getPool() is lazy; a fake URL is enough because Pool.prototype.query is stubbed below.
process.env.DATABASE_URL = 'postgres://stub:stub@127.0.0.1:1/stub';

import { processPaymentViaBanking } from './bankingService';

type QueryCall = { text: string; values: unknown[] | undefined };

function stubPoolQuery(rowsFor: (text: string) => unknown[]): { calls: QueryCall[]; restore: () => void } {
  const original = Pool.prototype.query;
  const calls: QueryCall[] = [];
  (Pool.prototype as unknown as { query: unknown }).query = async function (
    text: string,
    values?: unknown[]
  ) {
    calls.push({ text, values });
    return { rows: rowsFor(text), rowCount: 0 };
  };
  return {
    calls,
    restore: () => {
      (Pool.prototype as unknown as { query: unknown }).query = original;
    },
  };
}

test('processPaymentViaBanking: refuses a payment already in an Equity batch and does nothing else', async () => {
  const stub = stubPoolQuery((text) =>
    text.includes("channel = 'sftp_file'") ? [{ id: 'tx-1' }] : []
  );
  try {
    const result = await processPaymentViaBanking('pay-1', 'user-1');
    assert.deepEqual(result, {
      success: false,
      error: 'Payment is already in an Equity batch',
      status: 'failed',
    });
    assert.equal(stub.calls.length, 1, 'only the guard query may run');
    assert.deepEqual(stub.calls[0].values, ['pay-1']);
    assert.match(stub.calls[0].text, /status::text IN \('pending', 'processing', 'completed'\)/);
  } finally {
    stub.restore();
  }
});

test('processPaymentViaBanking: without an sftp_file row it continues to the normal lookup', async () => {
  const stub = stubPoolQuery(() => []);
  try {
    const result = await processPaymentViaBanking('pay-2', 'user-1');
    assert.deepEqual(result, {
      success: false,
      error: 'Payment not found or already processed',
      status: 'failed',
    });
    assert.equal(stub.calls.length, 2, 'guard query, then the existing payment lookup');
  } finally {
    stub.restore();
  }
});
