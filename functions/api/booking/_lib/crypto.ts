// Refresh tokens are long-lived keys to two mailboxes and two calendars. D1 is
// encrypted at rest, but it also has a dashboard query surface, so the tokens
// are wrapped again under a key that lives only in the Pages secret store.
// WebCrypto is on the runtime already; no dependency is needed.

const ALGORITHM = 'AES-GCM';
const IV_BYTES = 12;

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function importKey(base64Key: string): Promise<CryptoKey> {
  const raw = fromBase64(base64Key);
  if (raw.length !== 32) {
    throw new Error(`TOKEN_KEY must decode to 32 bytes, got ${raw.length}`);
  }
  return crypto.subtle.importKey('raw', raw as BufferSource, ALGORITHM, false, ['encrypt', 'decrypt']);
}

/**
 * Wrap a secret for storage. The random IV is prefixed to the ciphertext, so
 * one opaque string is all a row has to hold and every write gets a fresh IV.
 */
export async function seal(plaintext: string, base64Key: string): Promise<string> {
  const key = await importKey(base64Key);
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: ALGORITHM, iv }, key, new TextEncoder().encode(plaintext)),
  );
  const packed = new Uint8Array(iv.length + ciphertext.length);
  packed.set(iv, 0);
  packed.set(ciphertext, iv.length);
  return toBase64(packed);
}

/** Reverse of `seal`. Throws if the key is wrong or the payload was altered. */
export async function open(sealed: string, base64Key: string): Promise<string> {
  const key = await importKey(base64Key);
  const packed = fromBase64(sealed);
  if (packed.length <= IV_BYTES) throw new Error('sealed value is too short to contain an IV');
  const iv = packed.subarray(0, IV_BYTES);
  const ciphertext = packed.subarray(IV_BYTES);
  const plaintext = await crypto.subtle.decrypt({ name: ALGORITHM, iv }, key, ciphertext as BufferSource);
  return new TextDecoder().decode(plaintext);
}

/** A 128-bit capability, used for manage tokens and OAuth state. */
export function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
