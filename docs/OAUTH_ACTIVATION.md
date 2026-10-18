# OAuth activation — step-by-step

The codebase ships with the full Google sign-in flow already wired up
(routes, signed-cookie sessions, the `<SignInChip>` on `/settings`). It just
sits idle in production because `SESSION_SECRET` isn't set.

Once you finish the four steps below, `/api/auth/google` starts working,
verified-email-based editor gating kicks in, and every editor action
(`/api/review`, `/api/review/bulk`, `/api/ingest/by-arxiv-id`, `/api/rubric`,
`/api/notes/save`) records the *Google-verified* email as the actor rather
than a self-declared alias.

---

## 1 — Generate a session secret

The cookie payload is HMAC-SHA256 signed with this value. Any 32+ char
random string works; rotate it whenever you want to invalidate every
session at once.

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Sample output (do **not** reuse this — generate your own):

```
0c6e7d4f1a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5
```

## 2 — Add it to Vercel

```powershell
$secret = "<paste the value from step 1>"
$secret | vercel env add SESSION_SECRET production
$secret | vercel env add SESSION_SECRET preview
```

While you're there, double-check the three already-required vars are
present and **trim-clean** (no trailing newline — the SDKs send these as
HTTP header values):

| Var | Where it comes from |
|---|---|
| `GOOGLE_DRIVE_CLIENT_ID` | OAuth client JSON, `web.client_id` |
| `GOOGLE_DRIVE_CLIENT_SECRET` | OAuth client JSON, `web.client_secret` |
| `GOOGLE_DRIVE_REFRESH_TOKEN` | from `scripts/google-drive-bootstrap.mjs` |

Optional but recommended:

| Var | Effect |
|---|---|
| `EDITORS_EMAILS` | comma-separated verified emails (e.g. `isaiahdupree33@gmail.com,co-editor@…`). Once set, `isEditor()` only returns true when the *Google-verified* email matches — alias spoofing is no longer accepted. |
| `SITE_URL` | absolute origin used in the OAuth redirect. Defaults to `https://eccg-research-agent.vercel.app`. Set this if you move to a custom domain so the callback URL matches Cloud Console. |

## 3 — Add the production redirect URI in Google Cloud Console

1. Open <https://console.cloud.google.com/apis/credentials> in the
   **makedrive-422317** project.
2. Click the OAuth 2.0 Client ID currently in use
   (`7slkv5n75mahq2dumn8d31910tdchve7…`).
3. Under **Authorized redirect URIs**, add **both**:
   - `https://eccg-research-agent.vercel.app/api/auth/callback`
   - `https://<your-preview-domain>.vercel.app/api/auth/callback`
     *(preview domains rotate per deploy — see "Preview deploys" below)*
4. Save. The first sign-in after this change may need a hard refresh.

> Cloud Console takes a minute or two to propagate. If you get
> `redirect_uri_mismatch` immediately after saving, wait 60-90s and retry.

### Preview deploys

Preview URLs use the pattern
`https://eccg-research-agent-git-<branch>-<owner>.vercel.app`. Two options:

- **Whitelist a stable preview alias.** In Vercel Settings → Domains, add a
  custom alias like `eccg-preview.vercel.app` that always points at the
  latest preview, and register only that callback.
- **Skip preview auth.** Don't set `SESSION_SECRET` in the *Preview*
  environment — the sign-in chip will render "sign-in: not configured"
  and the editor allowlist falls back to the alias-only path. The
  scaffolding tolerates the missing var.

## 4 — Redeploy and verify

```powershell
vercel --prod
```

Then walk the flow:

1. Open `https://eccg-research-agent.vercel.app/settings`. The sign-in
   chip should now say **"Sign in with Google"** instead of
   *"sign-in: not configured"*.
2. Click it. Approve the consent screen.
3. You land back on `/settings?auth=ok` with the chip showing your
   verified email and a sign-out link.
4. Hit `GET /api/auth/me` from devtools — it should show
   `{ configured: true, signed_in: true, email: "you@example.com" }`.
5. With `EDITORS_EMAILS` set to your verified email, try POSTing to
   `/api/review` from a curl that **doesn't** carry the cookie — you
   should get a 403 with the alias-not-on-allowlist error. Then retry
   from the browser (cookie attached) and it should succeed.

## Common failure modes

| Symptom | Cause | Fix |
|---|---|---|
| Sign-in chip says *"not configured"* even after step 2 | `SESSION_SECRET` env var wasn't redeployed | re-run `vercel --prod` after `vercel env add` |
| `redirect_uri_mismatch` after clicking Sign in | Cloud Console redirect URI list missing or has trailing slash | exact-match URL must be listed; no `/` at the end |
| `token_exchange_failed` on callback | trailing newline in `GOOGLE_DRIVE_CLIENT_SECRET` | re-add via `printf '%s' "$value" \| vercel env add` (no `echo`), or check `.trim()` already runs server-side |
| Signed in but still getting 403 from /review | verified email not on `EDITORS_EMAILS` allowlist | add it, then re-deploy |
| Need to invalidate every session | rotate `SESSION_SECRET` | generate a new value and re-run step 2; all signed cookies become invalid immediately |

## What auth doesn't do (yet)

- **No per-user data isolation.** All editors share the same Drive state
  files. Sign-in is for *accountability* (who approved which paper) and
  *editor gating*, not multi-tenancy.
- **No refresh of the Google access token in the session cookie.** We
  only read the verified email from the id_token at sign-in time, then
  store nothing access-related in the cookie. Drive writes use the
  long-lived bootstrap refresh token, not the user's tokens.
- **No role hierarchy.** A user is either on `EDITORS_EMAILS` or not.
  When you need maintainer vs reviewer vs reader splits, add an extra
  env var per role.
