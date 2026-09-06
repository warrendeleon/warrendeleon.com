import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fail, json, maskEmail, safeEqual } from './http.ts';

describe('responses', () => {
  it('never lets an answer be cached', async () => {
    const response = json({ ok: true });
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await response.json(), { ok: true });
  });

  it('maps each error code to its status', () => {
    assert.equal(fail('slot_taken', 'gone').status, 409);
    assert.equal(fail('rate_limited', 'slow down').status, 429);
    assert.equal(fail('calendar_unavailable', 'google').status, 503);
  });

  it('carries field errors through to the form', async () => {
    const body = await fail('bad_request', 'check the form', { fields: { email: 'required' } }).json();
    assert.deepEqual(body, { error: 'bad_request', message: 'check the form', fields: { email: 'required' } });
  });
});

describe('secret comparison', () => {
  it('accepts a match and rejects everything else', () => {
    assert.equal(safeEqual('abc123', 'abc123'), true);
    assert.equal(safeEqual('abc123', 'abc124'), false);
    assert.equal(safeEqual('abc123', 'abc12'), false);
    assert.equal(safeEqual('', ''), true);
  });
});

describe('log masking', () => {
  it('keeps the domain and hides the local part', () => {
    assert.equal(maskEmail('warren@example.com'), 'w…n@example.com');
    assert.equal(maskEmail('jo@example.com'), 'j…@example.com');
    assert.equal(maskEmail('nonsense'), '***');
  });
});
