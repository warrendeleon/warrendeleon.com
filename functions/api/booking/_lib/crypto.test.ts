import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { open, randomToken, seal } from './crypto.ts';

const KEY = Buffer.from(new Uint8Array(32).fill(7)).toString('base64');
const OTHER_KEY = Buffer.from(new Uint8Array(32).fill(9)).toString('base64');

describe('token sealing', () => {
  it('returns the original secret', async () => {
    const sealed = await seal('1//refresh-token-value', KEY);
    assert.equal(await open(sealed, KEY), '1//refresh-token-value');
  });

  it('never writes the secret in the clear', async () => {
    const sealed = await seal('1//refresh-token-value', KEY);
    assert.ok(!sealed.includes('refresh-token-value'));
  });

  it('uses a fresh IV each time, so equal secrets do not look equal', async () => {
    const first = await seal('same', KEY);
    const second = await seal('same', KEY);
    assert.notEqual(first, second);
    assert.equal(await open(first, KEY), await open(second, KEY));
  });

  it('refuses the wrong key', async () => {
    const sealed = await seal('secret', KEY);
    await assert.rejects(() => open(sealed, OTHER_KEY));
  });

  it('refuses a tampered payload', async () => {
    const sealed = await seal('secret', KEY);
    const bytes = Buffer.from(sealed, 'base64');
    bytes[bytes.length - 1] ^= 0xff;
    await assert.rejects(() => open(bytes.toString('base64'), KEY));
  });

  it('rejects a key that is not 32 bytes', async () => {
    await assert.rejects(() => seal('secret', Buffer.from('short').toString('base64')), /32 bytes/);
  });

  it('rejects a payload too short to hold an IV', async () => {
    await assert.rejects(() => open(Buffer.from('tiny').toString('base64'), KEY), /too short/);
  });
});

describe('capabilities', () => {
  it('produces 128 bits of hex', () => {
    assert.match(randomToken(), /^[0-9a-f]{32}$/);
  });

  it('does not repeat', () => {
    const seen = new Set(Array.from({ length: 500 }, randomToken));
    assert.equal(seen.size, 500);
  });
});
