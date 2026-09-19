import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizePhoneAnyCountry, normalizePhoneForCountry } from '../../../shared/src/farmerId';

test('OTP login accepts Kenya and Uganda E.164 numbers', () => {
  assert.equal(normalizePhoneAnyCountry('+254711000001'), '+254711000001');
  assert.equal(normalizePhoneAnyCountry('+256771000001'), '+256771000001');
  assert.equal(normalizePhoneAnyCountry('256771000002'), '+256771000002');
  assert.equal(normalizePhoneAnyCountry('0711000001'), '+254711000001');
});

test('bare 0-prefix stays Kenya (legacy), not Uganda', () => {
  assert.equal(normalizePhoneForCountry('0771000001', 'Uganda'), '+256771000001');
  assert.equal(normalizePhoneAnyCountry('0771000001'), '+254771000001');
});
