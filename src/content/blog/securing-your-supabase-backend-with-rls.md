---
title: "Securing your Supabase backend with RLS, function hardening, and rate limits"
description: "Series closer: RLS policies that hold, storage bucket rules, function hardening with search_path, the orphaned-file cleanup pattern, and rate limiting."
publishDate: 2026-12-07
series: "Supabase Security"
tags: ["supabase", "security", "rls", "postgres", "owasp"]
locale: en
heroImage: "/images/blog/supabase-rls-security.webp"
heroImgPrompt: "A single key reaching a wall of pigeonhole cells where each only unlocks for its owner, one cell glowing open, a shield over a function block and a throttle gauge"
heroPalette: ["#6DC402", "#1F2D4D", "#E9664B", "#2A9D8F", "#7A4E8C", "#E8A93C", "#F3B4C1", "#A9D3EF", "#2C2C34", "#EBD9B4"]
heroBgColor: "#E4DCF2"
heroAlt: "Securing Supabase with Row Level Security"
campaign: "supabase-backend-security"
relatedPosts: ["pii-masking-interceptors-react-native", "certificate-pinning-in-react-native", "building-a-supabase-rest-client-without-the-sdk"]
---

This is part 7, the closer of the [Supabase-without-the-SDK series](/blog/building-a-supabase-rest-client-without-the-sdk/). The previous six posts hardened the client: typed clients, token refresh, certificate pinning, PII masking. None of that protects you if the backend trusts whoever has the anon key.

This post is about what you do on the Supabase side: Row Level Security policies that survive contact with attackers, storage bucket rules that constrain users to their own folders, function-level hardening that prevents privilege escalation, and the rate limits that make credential stuffing pointlessly slow.

Source for the SQL excerpts: [`supabase/migrations/`](https://github.com/warrendeleon/rn-warrendeleon/tree/main/supabase/migrations) and [`supabase/functions/`](https://github.com/warrendeleon/rn-warrendeleon/tree/main/supabase/functions) in the repo.

## Why client-side defences only do half the work

The anon key shipped in your app bundle is, by design, public. Anyone with a copy of your APK or IPA can extract it. Anyone running your app through `mitmproxy` can read it from the very first request. Treating it as a secret is a mistake; treating it as the credential that makes your backend secure is a much bigger one.

The anon key authenticates your app to Supabase as "an unauthenticated client". Whatever queries that role can run, an attacker with the anon key can also run, in their own scripts, against your project. The only thing standing between them and your entire database is RLS.

Some teams push authorisation into application code and rely on the service role for database access: simpler queries, fewer policies to audit, fewer surprises when an index is missing. That's a reasonable shape if the only client is a backend you trust. With a mobile app on the other end of the wire, the client isn't trusted, the API surface is `*.supabase.co`, and RLS is the layer that holds when the app-side check is bypassed. So RLS-first, even with the policy planner cost.

If RLS is off (or written wrong) on a single table, the attacker reads every row in it. If a function is `SECURITY DEFINER` without `search_path` set, they can hijack it to run as the function owner. If a storage bucket policy doesn't constrain paths, they can list and download every user's files.

Three things to get right, in this order: RLS on every table, storage policies, function hardening.

## Before shipping

Detail follows in every section below. The short pre-flight check, to run before any production deploy:

- [ ] **RLS enabled on every app-facing table.** `SELECT * FROM pg_tables WHERE schemaname = 'public' AND rowsecurity = false` should return zero rows.
- [ ] **Policies tested as the anon role and as authenticated users.** Not just "the query works in the SQL editor" (which runs as `postgres` and bypasses RLS).
- [ ] **Storage paths constrained by user ID.** Either `(storage.foldername(name))[1] = auth.uid()::text` on the bucket policy, or your equivalent path-encoded ownership.
- [ ] **`SECURITY DEFINER` functions all have an explicit `SET search_path`.** The Supabase dashboard linter flags missing ones.
- [ ] **`UPDATE` policies state both `USING` and `WITH CHECK` explicitly.** An omitted `WITH CHECK` safely falls back to `USING`; the patterns to hunt for are an explicit `WITH CHECK (true)` and pairs where the write predicate is weaker than the read predicate.
- [ ] **The service role key never appears in client code or `.env` files committed to source control.** Audit the repo with `git log -S 'service_role'`.
- [ ] **Auth-sensitive flows have rate limiting** (Supabase's built-in dashboard limits, or the SQL pattern below for RPC abuse).

## Assumptions

- You're using Supabase Auth (so `auth.uid()` returns the current user's UUID inside SQL contexts).
- Your tables live in the `public` schema and are accessed via PostgREST (the default for app-facing tables).
- You have access to the Supabase SQL editor or the local CLI for running migrations.

## RLS: enable on every table, deny by default

The single most common Supabase mistake is creating a table without RLS, accessing it from the app, watching it work, and shipping. Without RLS, any authenticated user can read and write any row. Without authentication, the anon role can do the same.

Enable RLS on every table you create:

```sql
-- For a new table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  bio TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
```

`ENABLE ROW LEVEL SECURITY` flips the default to "deny everything". With no policies attached, every query returns zero rows and every write is rejected. That's the safe state. From there, you add policies that explicitly grant access.

The dashboard shows a yellow banner when you create a table with RLS disabled. That banner is the only thing standing between "I forgot to enable RLS" and a public database. Don't dismiss it without enabling RLS.

## Writing policies that hold

RLS policies are SQL `WHERE` clauses that PostgREST attaches to every query before executing it. The policy `auth.uid() = id` on `SELECT` means "the row's `id` column must equal the current authenticated user's UUID". Anyone who isn't that user gets an empty result, no error, no leak.

Four policies are usually right:

```sql
-- Users can read their own profile
CREATE POLICY "Users read own profile"
  ON public.profiles
  FOR SELECT
  USING (auth.uid() = id);

-- Users can insert their own profile (typically handled by a trigger from auth.users, but
-- this policy guards against direct inserts that try to claim someone else's user_id)
CREATE POLICY "Users create own profile"
  ON public.profiles
  FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Users can update their own profile, but cannot reassign the id
CREATE POLICY "Users update own profile"
  ON public.profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Users can delete their own profile (rare; usually you cascade from auth.users instead)
CREATE POLICY "Users delete own profile"
  ON public.profiles
  FOR DELETE
  USING (auth.uid() = id);
```

The distinction between `USING` and `WITH CHECK` is the part most policies get wrong:

- **`USING`** filters rows the user can see. It's the predicate that runs against existing rows for `SELECT`, `UPDATE`, and `DELETE`.
- **`WITH CHECK`** validates rows the user is *creating* or *modifying into*. It runs against the new row for `INSERT` and the post-update row for `UPDATE`.

A common misreading: that an `UPDATE` policy with only `USING (auth.uid() = id)` lets a user change the `id` column to someone else's UUID. It doesn't. When `WITH CHECK` is omitted, Postgres applies the `USING` expression to the new row as well, so the reassignment is already blocked. The genuinely dangerous patterns are explicit ones: a policy that adds `WITH CHECK (true)` next to a strict `USING` (which really does let the post-update row belong to anyone), and mismatched pairs where the write predicate is quietly weaker than the read predicate.

Writing both clauses explicitly, as the policy above does, is still the right habit. Not because the fallback is unsafe, but because an explicit pair states the intent: a reviewer can check the two predicates against each other instead of having to remember the fallback rule.

## Reading other users' rows safely

Some data needs to be readable by users other than the owner: public profiles, comments on a post, list of members of a workspace. The pattern is to write a `SELECT` policy that allows reads under the conditions you actually intend, instead of trying to filter the data in the app:

```sql
-- Anyone authenticated can read display_name and bio (public profile fields)
-- but full email and phone stay private
CREATE POLICY "Public can read public profile fields"
  ON public.profiles
  FOR SELECT
  USING (true);
```

But that policy returns *every* column, and RLS can't help with that: policies filter rows, never columns. There's no such thing as a policy for the private columns. Column-level privacy comes from one of two other mechanisms: column grants, or a two-table split. A view is the usual way to package the column-grant shape:

```sql
CREATE VIEW public.public_profiles
  WITH (security_invoker = true) AS
  SELECT id, display_name, bio, created_at
  FROM public.profiles;

GRANT SELECT ON public.public_profiles TO authenticated, anon;
```

The `security_invoker = true` option (PostgreSQL 15+) is doing real work. By default a Postgres view runs with its **owner's** privileges, and in Supabase that owner is typically `postgres`, a role that bypasses RLS entirely. A plain `CREATE VIEW` here would serve the selected columns from *all* rows, ignoring every policy on the base table; that's the "security definer view" warning the Supabase dashboard linter raises. With `security_invoker` set, the base table's RLS applies to whoever queries the view.

Two things follow from that. The view now needs the base table to allow the rows through, so the `USING (true)` `SELECT` policy stays, but it can't be left there with the default table-wide `SELECT` grant: that combination hands every column of every row to any authenticated user who queries `profiles` directly, which is exactly what the view was built to prevent. Revoke the wide grant and grant only the public columns:

```sql
REVOKE SELECT ON public.profiles FROM authenticated, anon;
GRANT SELECT (id, display_name, bio, created_at)
  ON public.profiles TO authenticated, anon;
```

The alternative that's easier to reason about six months later is the two-table split: a `public_profiles` *table* with a `USING (true)` read policy, and the private fields in a table with owner-only policies. No view, no grants to keep in sync.

## Storage policies

Storage buckets are tables underneath. The same RLS pattern applies, but with a different helper function for path inspection.

```sql
-- For the profile-pictures bucket, users can only access files in their own folder
CREATE POLICY "Users upload to own folder"
  ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'profile-pictures'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users update own folder"
  ON storage.objects
  FOR UPDATE
  USING (
    bucket_id = 'profile-pictures'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'profile-pictures'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users delete own files"
  ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'profile-pictures'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Reads are public for this bucket (it's used to render avatars in the app)
CREATE POLICY "Public read profile pictures"
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'profile-pictures');
```

`storage.foldername(name)` splits the storage object's path on `/`. `(...)[1]` gets the first segment. The convention from [the storage client post](/blog/building-a-supabase-storage-client-with-retry/) was to upload paths like `${userId}/profile-${timestamp}.jpg`, which puts the user ID at index 1 (PostgreSQL arrays are 1-indexed). The policy enforces that the first segment of any uploaded path matches the current user.

Without this constraint, an authenticated user could upload to *any* path, including overwriting another user's profile picture. The path layout is what makes the policy cheap. Without the owner's identity in a predictable position, you'd be joining against another table for every storage operation just to find out who owns the file.

## Function security: SECURITY DEFINER and search_path

Functions in PostgreSQL run with one of two security models:

- **`SECURITY INVOKER`** (default): the function runs with the permissions of whoever called it. If the caller can't read a table, the function can't either.
- **`SECURITY DEFINER`**: the function runs with the permissions of whoever *created* it. Used for functions that need to break through RLS on behalf of trusted operations.

`SECURITY DEFINER` is necessary for some patterns (the cleanup queue trigger below uses it because it needs to insert into a queue table the user shouldn't have direct access to). It's also one of the most common privilege-escalation footguns, because **PostgreSQL's default `search_path` includes `public`**, and an attacker who can create functions in `public` can hijack any unqualified function call inside a `SECURITY DEFINER` function.

The fix is to set `search_path` explicitly on every `SECURITY DEFINER` function:

```sql
CREATE OR REPLACE FUNCTION queue_old_profile_picture()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public  -- ← this line is the security control
AS $$
DECLARE
  old_path TEXT;
BEGIN
  -- function body
END;
$$;
```

Without `SET search_path`, the function inherits whatever search_path the caller had, which means an attacker can prepend a malicious schema to their search_path and have the function call their version of any helper instead of the real one. With `SET search_path`, the function uses a fixed list, regardless of caller state.

The Supabase linter in the dashboard flags missing `search_path` on `SECURITY DEFINER` functions. Treat that warning as a blocker for the migration, not a suggestion.

## The orphaned-file cleanup pattern

The storage post referenced this without showing it. The full implementation has two parts: a trigger that captures old picture URLs into a queue, and an Edge Function that processes the queue.

### The queue table

```sql
CREATE TABLE public.storage_cleanup_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_path TEXT NOT NULL,
  bucket TEXT NOT NULL DEFAULT 'profile-pictures',
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  queued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  error_message TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,

  CONSTRAINT valid_bucket CHECK (bucket IN ('profile-pictures'))
);

CREATE INDEX idx_cleanup_queue_unprocessed
  ON public.storage_cleanup_queue (queued_at)
  WHERE processed_at IS NULL;

ALTER TABLE public.storage_cleanup_queue ENABLE ROW LEVEL SECURITY;
-- No policies attached. Only the service role (used by the Edge Function)
-- can read or write this table.
```

The deliberate absence of policies is the point. RLS is enabled, no policies grant access, so only the service role bypasses it. Authenticated users can't see the queue, can't enumerate other users' deletions, and can't tamper with retry counts.

### The trigger

```sql
-- Parses '.../storage/v1/object/public/{bucket}/{path}' into '{path}'
CREATE OR REPLACE FUNCTION extract_storage_path(url TEXT, bucket_name TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  pattern TEXT;
  result TEXT;
BEGIN
  pattern := '/storage/v1/object/public/' || bucket_name || '/';

  IF position(pattern IN url) > 0 THEN
    result := substring(url FROM position(pattern IN url) + length(pattern));
    RETURN result;
  END IF;

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION queue_old_profile_picture()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  old_path TEXT;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.raw_user_meta_data->>'profile_picture' IS DISTINCT FROM
       NEW.raw_user_meta_data->>'profile_picture' THEN

      old_path := extract_storage_path(
        OLD.raw_user_meta_data->>'profile_picture',
        'profile-pictures'
      );

      IF old_path IS NOT NULL THEN
        INSERT INTO public.storage_cleanup_queue (file_path, bucket, user_id)
        VALUES (old_path, 'profile-pictures', OLD.id);
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER queue_old_profile_picture_trigger
  AFTER UPDATE OF raw_user_meta_data ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION queue_old_profile_picture();
```

The trigger sits on `auth.users` and fires whenever `raw_user_meta_data` changes. If the `profile_picture` key inside that JSONB changes, the old URL is parsed into a storage path (by `extract_storage_path` above) and inserted into the queue. The user's session never has to coordinate two operations; the trigger does it atomically as part of the same transaction that updates the profile.

The client side of that handshake is one call after a successful upload: the auth client writes the new URL into user metadata, and that write is what the trigger watches. GoTrue's `data` field is what lands in `raw_user_meta_data`:

```typescript
// On SupabaseAuthClient, called after uploadProfilePicture succeeds
await this.axiosInstance.put('/auth/v1/user', {
  data: { profile_picture: publicUrl },
});
```

`SECURITY DEFINER` is required here because authenticated users have no INSERT permission on `storage_cleanup_queue`. The function runs as the migration's owner (typically `postgres`), which does have permission. `SET search_path = public` keeps it from being hijacked.

### The Edge Function

```typescript
// supabase/functions/cleanup-storage/index.ts
import { createClient } from 'jsr:@supabase/supabase-js@2';

const BATCH_SIZE = 50;
const MAX_RETRIES = 3;

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { data: items, error: fetchError } = await supabase
    .from('storage_cleanup_queue')
    .select('id, file_path, bucket, retry_count')
    .is('processed_at', null)
    .lt('retry_count', MAX_RETRIES)
    .order('queued_at', { ascending: true })
    .limit(BATCH_SIZE);

  if (fetchError) throw fetchError;
  if (!items?.length) {
    return new Response(JSON.stringify({ message: 'No items' }), { status: 200 });
  }

  for (const item of items) {
    const { error } = await supabase.storage.from(item.bucket).remove([item.file_path]);

    if (error && !error.message?.includes('Not found')) {
      // Real failure: increment retry count, leave for next run
      await supabase
        .from('storage_cleanup_queue')
        .update({ retry_count: item.retry_count + 1, error_message: error.message })
        .eq('id', item.id);
      continue;
    }

    // Success (or already deleted): mark processed
    await supabase
      .from('storage_cleanup_queue')
      .update({ processed_at: new Date().toISOString(), error_message: null })
      .eq('id', item.id);
  }

  return new Response(JSON.stringify({ processed: items.length }), { status: 200 });
});
```

The function uses the **service role key** because it needs to bypass RLS on the queue table and delete files across user folders. That key never leaves Supabase's infrastructure: it's set as a function secret, the function reads it from `Deno.env`, and the function runs server-side.

Schedule it weekly (plenty for profile pictures). Two extensions have to be enabled first, under **Database → Extensions** in the dashboard: `pg_cron` for the schedule and `pg_net` for the HTTP call.

```sql
SELECT cron.schedule(
  'cleanup-storage-weekly',
  '0 3 * * 0',  -- Sunday 03:00 UTC
  $$
    SELECT net.http_post(
      url := 'https://your-project.supabase.co/functions/v1/cleanup-storage',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || (
          SELECT decrypted_secret FROM vault.decrypted_secrets
          WHERE name = 'service_role_key'
        ),
        'Content-Type', 'application/json'
      )
    );
  $$
);
```

The key comes from **Supabase Vault**, not from a database setting. The tempting alternative, a custom GUC read with `current_setting('app.settings.service_role_key')`, is readable by anything that can evaluate SQL in the database: dashboard users, a definer function, any SQL-injection foothold. Vault stores the secret encrypted, and `vault.decrypted_secrets` is only readable by the roles you grant. Create the secret once (dashboard, **Settings → Vault**, name it `service_role_key`) before scheduling; without it, every cron run silently 401s with no log line that tells you why.

## Rate limiting

Supabase Auth has built-in rate limits on the auth endpoints: sign-in, sign-up, password recovery, OTP. The defaults are conservative (a few attempts per hour per IP). Verify they're enabled and tuned for your traffic in the dashboard under Authentication → Rate Limits.

For your own RPC functions and table queries, Supabase enforces a global throughput limit per project (varies by plan) but **no per-user limit by default**. A stolen anon key plus an expensive RPC is enough to drive a bill spike or a soft DoS. The mitigation is something you build yourself; Supabase doesn't ship a per-user rate limiter.

One scope note before the SQL: this limiter covers **authenticated** RPC abuse only. For the anon role, `auth.uid()` is NULL, so the insert below would fail on the NOT NULL column rather than rate-limit anything. Unauthenticated abuse is the job of Supabase's built-in auth limits and edge-level limits (the Cloudflare option at the end of this section). The pattern below is for a signed-in user, or an attacker holding a captured session, hammering an expensive RPC.

```sql
-- 1. A log table that records every rate-limited action per user.
--    clock_timestamp(), not NOW(): NOW() is frozen for the whole
--    transaction, so two same-action calls in one transaction would
--    collide on the primary key instead of both being counted.
CREATE TABLE public.rate_limit_log (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (user_id, action, occurred_at)
);

ALTER TABLE public.rate_limit_log ENABLE ROW LEVEL SECURITY;
-- No policies. Only the SECURITY DEFINER function below can insert.

-- 2. A function that serialises per (user, action), counts recent calls,
--    and raises if over the limit. Atomicity comes from the advisory
--    lock plus the implicit transaction the function runs in.
CREATE OR REPLACE FUNCTION public.check_rate_limit(action_name TEXT, max_per_hour INT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  recent_count INT;
BEGIN
  -- Serialise concurrent calls for the same (user, action). The lock is
  -- released at the end of the transaction.
  PERFORM pg_advisory_xact_lock(
    hashtextextended(auth.uid()::text || ':' || action_name, 0)
  );

  SELECT COUNT(*) INTO recent_count
  FROM public.rate_limit_log
  WHERE user_id = auth.uid()
    AND action = action_name
    AND occurred_at > NOW() - INTERVAL '1 hour';

  IF recent_count >= max_per_hour THEN
    RAISE EXCEPTION 'Rate limit exceeded' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.rate_limit_log (user_id, action) VALUES (auth.uid(), action_name);
END;
$$;
```

Then call it at the top of any expensive RPC:

```sql
CREATE OR REPLACE FUNCTION public.generate_export() RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.check_rate_limit('export', 5);

  -- ... actual export logic. If check_rate_limit raised, this never
  -- runs and the whole transaction (including the rate_limit_log insert)
  -- rolls back.
  RETURN jsonb_build_object('ok', true);
END;
$$;
```

**The advisory lock is the load-bearing line.** Without `pg_advisory_xact_lock`, you have a check-then-act race: two parallel calls both read `recent_count = max - 1`, both pass the check, both insert. The user gets two requests through when the limit was one. Under burst attack the limiter doesn't actually limit. With the lock, one transaction holds the gate per (user, action) until it commits, and the next caller sees the inserted row in their COUNT.

A scheduled cron prunes old rows so the table doesn't grow forever:

```sql
SELECT cron.schedule(
  'rate-limit-prune',
  '0 4 * * *',  -- daily at 04:00 UTC
  $$ DELETE FROM public.rate_limit_log
     WHERE occurred_at < NOW() - INTERVAL '7 days' $$
);
```

Supabase doesn't ship this, and the pattern isn't sophisticated. It's coarse-grained (one row per call, no token-bucket smoothing) and the table has to be pruned. The advisory lock fixes the obvious concurrency bug, but a determined attacker firing thousands of parallel requests will still saturate the function-call rate Postgres can handle, and the lock contention itself becomes the bottleneck. For higher-throughput needs or seriously hostile traffic, Cloudflare's per-route rate limits or a proper API gateway in front of Supabase is the right answer. The SQL pattern above holds for app-tier RPC abuse from a stolen anon key. It's not a substitute for edge-level rate limiting.

## The OWASP-mobile attack surface, briefly

The OWASP Mobile Top 10 covers concerns this series has addressed in passing. Mapping each to where it lives in the series:

| OWASP Mobile risk | Where it's covered |
|---|---|
| M1 Improper Credential Usage | [Tiered storage](/blog/tiered-secure-storage-react-native/) (tokens in Keychain, not AsyncStorage) |
| M2 Inadequate Supply Chain Security | Not covered in this series. Dependency review, lockfile pinning, and SBOM generation are the standard mitigations and live outside the scope of these posts. |
| M3 Insecure Authentication / Authorization | RLS policies (this post), [token refresh queue](/blog/token-refresh-race-condition-react-native/) |
| M4 Insufficient Input/Output Validation | Zod runtime validation in [the auth client post](/blog/building-an-axios-based-supabase-auth-client/) |
| M5 Insecure Communication | [Certificate pinning](/blog/certificate-pinning-in-react-native/) |
| M6 Inadequate Privacy Controls | [PII masking](/blog/pii-masking-interceptors-react-native/), RLS limiting cross-user reads |
| M7 Insufficient Binary Protections | Not covered in this series. This one is about reverse engineering and tampering; the standard mitigations are code obfuscation, root/jailbreak detection, and integrity checks. |
| M8 Security Misconfiguration | This post (RLS off by default, missing search_path) |
| M9 Insecure Data Storage | Tiered storage |
| M10 Insufficient Cryptography | Use platform crypto (Keychain, AES-256), don't roll your own |

Eight of the ten are addressed across the series. The remaining two, M2 (supply chain) and M7 (binary protections), are real concerns that sit outside these posts' scope. Together with mitigations for those two, that's a reasonable mobile security posture for any Supabase-backed app.

## Common pitfalls

**Don't disable RLS to "make it work" in development.** Test the policies locally with a real authenticated session. If the query returns empty, the bug is your policy, not the table. Disabling RLS to ship faster gets shipped to production.

**Don't use the service role key on the client. Ever.** It bypasses every RLS policy on every table. If it leaks (and it will, the moment one developer copies it into a `.env` file), every row in your database is readable and writable. The service role exists for Edge Functions and trusted backend code only.

**Don't assume plain aggregates leak hidden rows; the real side channels are subtler.** RLS filters rows before aggregation, so `SELECT count(*)` only counts what the policy allows. The channels that genuinely leak are indirect: a unique-constraint violation on INSERT confirms a hidden row exists (and the default error names the conflicting value), `pg_stats` exposes sampled column values to anyone allowed to read it, and your own functions can echo protected data in `RAISE` messages. Keep constraint errors generic in RPCs, and treat anything that reports *why* a write failed as a potential oracle.

**Don't trust the trigger to fire on every code path.** The cleanup queue trigger runs on `UPDATE OF raw_user_meta_data ON auth.users`. If a future code path updates the column without going through the user metadata, the trigger doesn't fire and the orphan accumulates. Audit the schema for direct writes that bypass triggers.

**Don't write a `WITH CHECK` weaker than your `USING` on `UPDATE` policies.** An omitted `WITH CHECK` falls back to `USING`, which is safe. An explicit `WITH CHECK (true)` next to a strict `USING` is what lets users hand their rows to someone else. State both clauses and check them against each other in review.

**Don't expose the `auth` schema to PostgREST.** It's not exposed by default, but a careless `GRANT SELECT ON auth.users TO anon` somewhere in a migration is the kind of thing nobody notices for months. Audit the grants directly: `SELECT * FROM information_schema.role_table_grants WHERE table_schema = 'auth' AND grantee IN ('anon', 'authenticated')`, and `REVOKE` anything that shouldn't be there.

**Don't skip the `SET search_path` on `SECURITY DEFINER` functions.** This is the privilege-escalation pattern most Supabase tutorials miss. The Supabase dashboard linter flags it; treat the warning as a blocker.

## Series wrap-up

Seven posts. The full Supabase integration in React Native, from the why through the how, with the security posture that would survive a careful code review:

1. **[Building a Supabase integration in React Native without the SDK](/blog/building-a-supabase-rest-client-without-the-sdk/)**: the why.
2. **[Building an Axios-based Supabase auth client](/blog/building-an-axios-based-supabase-auth-client/)**: sign-up, sign-in, sign-out, current user, request interceptor.
3. **[Token refresh race conditions](/blog/token-refresh-race-condition-react-native/)**: subscriber queue, single in-flight refresh, race-condition test.
4. **[Building a Supabase storage client with retry](/blog/building-a-supabase-storage-client-with-retry/)**: uploads, exponential backoff, the 4xx-vs-5xx rule.
5. **[Certificate pinning in React Native](/blog/certificate-pinning-in-react-native/)**: TrustKit on iOS, network_security_config on Android, pin rotation strategy.
6. **[PII-masking interceptors](/blog/pii-masking-interceptors-react-native/)**: field-name and regex masking, Sentry beforeSend integration.
7. **Securing your Supabase backend with RLS**: this post.

Reading the series end-to-end builds a complete Supabase integration ready for production. Reading any one post solves a single concrete problem. Both shapes are intentional.

Source for everything: [github.com/warrendeleon/rn-warrendeleon](https://github.com/warrendeleon/rn-warrendeleon). Each post in the series is filed under [the supabase tag at warrendeleon.com](https://warrendeleon.com/blog/tags/supabase/).
