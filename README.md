# Flashcard SRS Pro — Cloud Edition

This version keeps the existing SRS interface and moves persistence to Supabase. GitHub Pages hosts the frontend; Supabase Auth and PostgreSQL provide login and cross-device sync. No self-managed Node.js/Python server is required.

## 1. Create the Supabase project

1. Create a project at https://supabase.com/.
2. Open **SQL Editor** and run all of `supabase-schema.sql`.
3. Open **Project Settings → API** (or the API Keys section).
4. Copy the **Project URL** and the **publishable key** (or legacy `anon` key).
5. Paste both into `config.js`.
6. Never use a `service_role` or `sb_secret_...` key in `config.js` or any browser file.

## 2. Add your TXT datasets

Replace the contents of the empty files in `data/` with your existing TXT databases. The supported format is:

```text
Question > Answer > Level > Score > YYYY-MM-DD
```

The cloud edition also exports/restores two optional streak fields:

```text
Question > Answer > Level > Score > YYYY-MM-DD > pass_streak > new_consecutive
```

Older four/five-column files remain supported. Add/remove datasets by editing `data/decks.json`. Every `id` must be unique and stable, and each `file` must point to an existing file in this repository.

## 3. Publish with GitHub Pages

1. Create a GitHub repository and upload the contents of this folder (not the folder itself): `index.html`, `app.js`, `config.js`, `data/`, and `supabase-schema.sql`.
2. In GitHub, open **Settings → Pages**.
3. Choose **Deploy from a branch**, select your main branch and `/ (root)`, then Save.
4. Copy the published Pages URL.
5. In Supabase, open **Authentication → URL Configuration** and add the Pages URL to **Site URL** and **Redirect URLs**. Use the exact published site URL.

## 4. Create an account and use it

1. Open the published website.
2. Create an account with email and a password (minimum 8 characters in this app).
3. If email confirmation is enabled, confirm the email before logging in.
4. Log in and select a dataset. Its TXT file is imported into that user's cloud account on first selection.
5. The first import is a snapshot. After that, card changes and SRS progress are saved to Supabase. Use **Save to Cloud** to force a full save, and **Download Backup** to export a TXT backup.
6. Log in with the same account on another device to see the same cloud dataset.

## Data behaviour and important notes

- Each Supabase account gets its own copy of each selected dataset. Users do not overwrite the repository's original TXT files or one another's cards.
- A dataset is imported only once per account. Editing the repository's TXT file later does not overwrite a user's cloud copy. Add a new deck ID for a new version, or implement a controlled re-import feature before distributing updates.
- Add/Edit/Pass/Fail/Deletion actions save to cloud. **Save to Cloud** is also available as a manual full sync. **Download Backup** downloads the active deck as TXT.
- The Level 0 pass target uses the existing Winning Streak setting, defaulting to 2. New cards therefore advance after two consecutive passes by default.
- This starter version uses last-write-wins for the same card if the same account edits it simultaneously on two devices. Avoid reviewing the exact same card concurrently on both devices.
- Keep `config.js` limited to the Project URL and publishable/anon key. RLS in `supabase-schema.sql` protects per-user rows. Never expose a Supabase secret/service-role key.
- Deploying a static site requires HTTPS for production use; GitHub Pages provides HTTPS by default on its `github.io` URL.

## Troubleshooting

- **Login fails:** check that `config.js` contains the correct URL and publishable/anon key; check Supabase Auth email confirmation settings.
- **Dataset list is empty:** check `data/decks.json` is valid JSON and that each referenced TXT file exists.
- **Permission/RLS error:** rerun `supabase-schema.sql` and check that the user is signed in.
- **No sync across devices:** make sure both devices are logged in to the same account and have internet access.
