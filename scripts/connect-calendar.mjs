// One-shot Google consent, for connecting a calendar account before the admin
// site exists. Serves the callback on localhost:8788, which is already an
// authorised redirect URI on the OAuth client.
//
//   node scripts/connect-calendar.mjs           writes into the local database
//   node scripts/connect-calendar.mjs --remote  writes into the live one
//
// The refresh token is sealed with TOKEN_KEY and handed to wrangler through a
// temporary file, so it is never printed and never sits in shell history.

import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { seal } from '../functions/api/booking/_lib/crypto.ts';

const run = promisify(execFile);
const PORT = 8788;
const REDIRECT = `http://localhost:${PORT}/oauth/google/callback`;
const SCOPES = [
  'openid',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.freebusy',
];

const remote = process.argv.includes('--remote');

const vars = Object.fromEntries(
  readFileSync(new URL('../.dev.vars', import.meta.url), 'utf8')
    .split('\n')
    .filter((line) => line.includes('=') && !line.startsWith('#'))
    .map((line) => {
      const at = line.indexOf('=');
      return [line.slice(0, at), line.slice(at + 1)];
    }),
);

const consentUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
consentUrl.searchParams.set('client_id', vars.GOOGLE_CLIENT_ID);
consentUrl.searchParams.set('redirect_uri', REDIRECT);
consentUrl.searchParams.set('response_type', 'code');
consentUrl.searchParams.set('scope', SCOPES.join(' '));
consentUrl.searchParams.set('access_type', 'offline');
// Without this Google withholds a refresh token on a repeat consent.
consentUrl.searchParams.set('prompt', 'consent');
consentUrl.searchParams.set('include_granted_scopes', 'false');

console.log(`\nWriting to the ${remote ? 'REMOTE' : 'local'} database.`);
console.log('\nOpen this and sign in with the account you want to connect:\n');
console.log(consentUrl.toString());
console.log('\nWaiting for the callback…\n');

const reply = (response, status, message) => {
  response.writeHead(status, { 'content-type': 'text/html; charset=utf-8' });
  response.end(`<!doctype html><meta charset="utf-8"><title>Calendar</title>
<body style="font:16px system-ui;padding:3rem;max-width:32rem">${message}</body>`);
};

const server = createServer(async (request, response) => {
  const url = new URL(request.url, `http://localhost:${PORT}`);
  if (url.pathname !== '/oauth/google/callback') {
    reply(response, 404, '<p>Not this one.</p>');
    return;
  }

  const error = url.searchParams.get('error');
  if (error) {
    reply(response, 400, `<h1>Refused</h1><p>Google said: <code>${error}</code></p>`);
    console.error(`\nConsent refused: ${error}`);
    server.close();
    process.exitCode = 1;
    return;
  }

  const code = url.searchParams.get('code');
  if (!code) {
    reply(response, 400, '<p>No code in the callback.</p>');
    return;
  }

  try {
    const exchange = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: vars.GOOGLE_CLIENT_ID,
        client_secret: vars.GOOGLE_CLIENT_SECRET,
        redirect_uri: REDIRECT,
        grant_type: 'authorization_code',
      }),
    });

    const payload = await exchange.json();
    if (!exchange.ok) {
      throw new Error(`${exchange.status} ${payload.error ?? 'unknown'}: ${payload.error_description ?? ''}`);
    }
    if (!payload.refresh_token) {
      throw new Error('Google returned no refresh token. Revoke the app for this account and try again.');
    }

    // The id_token carries the address; splitting it beats another API call.
    const claims = JSON.parse(Buffer.from(payload.id_token.split('.')[1], 'base64url').toString('utf8'));
    const email = claims.email;
    if (!email) throw new Error('the id_token carried no email claim');

    const sealed = await seal(payload.refresh_token, vars.TOKEN_KEY);
    const sqlFile = join(tmpdir(), `connect-${Date.now()}.sql`);
    writeFileSync(
      sqlFile,
      `INSERT INTO calendar_accounts (email, refresh_token_enc, check_busy, status, connected_at, updated_at)
       VALUES ('${email}', '${sealed}', 1, 'ok', datetime('now'), datetime('now'))
       ON CONFLICT(email) DO UPDATE SET
         refresh_token_enc = excluded.refresh_token_enc,
         status = 'ok', last_error = NULL, updated_at = datetime('now');`,
    );

    try {
      await run('npx', [
        'wrangler',
        'd1',
        'execute',
        'warrendeleon-booking',
        remote ? '--remote' : '--local',
        '--file',
        sqlFile,
      ]);
    } finally {
      unlinkSync(sqlFile);
    }

    const scopes = (payload.scope ?? '').split(' ').filter(Boolean);
    console.log(`Connected ${email}`);
    console.log(`Scopes granted: ${scopes.join(', ')}`);
    reply(
      response,
      200,
      `<h1>Connected</h1><p><strong>${email}</strong> is now connected. You can close this tab.</p>`,
    );
  } catch (cause) {
    console.error(`\nFailed: ${cause.message}`);
    reply(response, 500, `<h1>Failed</h1><p>${cause.message}</p>`);
    process.exitCode = 1;
  } finally {
    server.close();
  }
});

server.listen(PORT);
