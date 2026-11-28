# Switching on accounts: the setup checklist

Accounts need two free services that only the owner of Tandem Roads can sign up for: Supabase
(the database and sign-in, in Canada) and Resend (sends the sign-in code emails). Everything else
is done by the **Connect accounts** workflow. About 20 minutes, most of it waiting for email DNS.

You need: the email you will sign in with, Cloudflare (where tandemroads.com's DNS lives), and
this repository's settings on GitHub.

## 1. Supabase (free)

1. Sign up at [supabase.com](https://supabase.com) (signing in with GitHub is fine).
2. **New project**: name `tandem-roads`, region **Canada (Central)**, plan **Free**. Make up a
   strong database password and keep it in your password manager. Leave the other options as
   they are. The region cannot be changed later.
3. When the project is ready, note its **project ref**: the 20 letters in its address,
   `supabase.com/dashboard/project/<project ref>`.
4. Your avatar (top right) > **Account preferences** > **Access Tokens** > **Generate new token**
   ([direct link](https://supabase.com/dashboard/account/tokens)), named `GitHub`. Copy it.

## 2. Resend (free, 3,000 emails a month)

1. Sign up at [resend.com](https://resend.com).
2. **Domains** > **Add domain** > `mail.tandemroads.com`.
3. Resend lists a few DNS records. In Cloudflare, open tandemroads.com > **DNS** > **Records** and
   add each one exactly as shown (for any record Cloudflare offers to proxy, choose
   **DNS only**). Back in Resend, press **Verify**. It usually takes a few minutes.
4. **API Keys** > **Create API key**, permission **Sending access**, domain
   `mail.tandemroads.com`. Copy it (it starts with `re_`).

## 3. Five secrets on GitHub

In this repository: **Settings** > **Secrets and variables** > **Actions** >
**New repository secret** ([direct link](https://github.com/mindfulmod/roam/settings/secrets/actions)).
Add each of these:

| Name                    | Value                                   |
| ----------------------- | --------------------------------------- |
| `SUPABASE_ACCESS_TOKEN` | the token from step 1.4                 |
| `SUPABASE_PROJECT_REF`  | the 20 letters from step 1.3            |
| `SUPABASE_DB_PASSWORD`  | the database password from step 1.2     |
| `RESEND_API_KEY`        | the key from step 2.4                   |
| `ADMIN_EMAIL`           | the email you will sign in with         |

Emails are sent from `hello@mail.tandemroads.com`. To use another address on a domain verified in
Resend, add a repository **variable** (not a secret) named `EMAIL_FROM`.

## 4. Run it

**Actions** > **Connect accounts** > **Run workflow**
([direct link](https://github.com/mindfulmod/roam/actions/workflows/connect-accounts.yml)). It sets
up the database, the sign-in emails and your founder account, then redeploys the site: about five
minutes in all. If a step fails, its log says why in plain words.

## 5. Sign in

Open [tandemroads.com/#/account](https://tandemroads.com/#/account), sign in with your
`ADMIN_EMAIL`, and type the code from the email. You are the first member. Then
**Account** > **Friends** > **Invite a friend** makes a link to send to someone. Each link works
once, for 14 days.

## What it costs, and when to pay

Nothing to start. Before real trip photos go in (when planning the Japan trip starts), switch the
Supabase project to **Pro** (US$25 a month): free projects pause after a week with no use and
have no backups, and Pro projects never pause and keep seven days of daily backups. Resend's free
plan (100 emails a day) is plenty for friends and family.

## How it fits together

- `supabase/migrations/`: the database and its privacy rules, applied by the workflow with
  `supabase db push`. Rules and tests: [data-model.md](data-model.md).
- `scripts/supabase/auth-settings.mjs`: the sign-in choices (six-digit code, 15 minutes, email
  through Resend, the invite-only hook), applied by `scripts/supabase/connect.mjs` through
  Supabase's Management API.
- `data/backend.json`: the project's address and publishable key, written by the workflow. Both
  are meant to be public; the database rules decide what anyone can read or change. An empty
  `{}` means accounts are off and the social pages show the sample.
- The workflow runs again by itself whenever a merged change touches the database or the
  sign-in settings, so the live project always matches the code.
