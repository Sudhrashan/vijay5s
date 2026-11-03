# Deploying the Vijay 5S Console to Railway (10-day pilot)

What you will end up with, all in one Railway project:

| Service | What it is | Public? |
|---|---|---|
| **Postgres** | The database (Railway plugin) | No |
| **api** | The FastAPI backend, built from `backend/` | No (private only) |
| **web** | The website (nginx), built from `frontend/`. It forwards `/api` and `/ws` to **api** | Yes - this is the link users open |

Photos are stored in Supabase Storage, so no Railway disk is needed. Never paste real passwords or keys into this file.

---

## 1. Put the code on GitHub (one time)

1. Install **Git for Windows** (https://git-scm.com/download/win) - accept the defaults.
2. On github.com create a new **Private** repository called `vijay-5s`. Do not add a README.
3. Open PowerShell and run, one line at a time:

```powershell
cd E:\vijay-5s
git init
git add .
git check-ignore -v backend/.env        # MUST print a line ending in "backend/.env"
git status                               # check that "backend/.env" is NOT in the list
git commit -m "Vijay 5S Console - pilot release"
git branch -M main
git remote add origin https://github.com/<your-github-name>/vijay-5s.git
git push -u origin main
```

> **Stop if `backend/.env` appears in `git status`.** It holds local secrets. Run `git rm --cached backend/.env`, check `.gitignore` contains `.env`, then commit again.

## 2. Create the Railway project and database

1. Sign in at https://railway.com with your GitHub account.
2. **New Project -> Deploy PostgreSQL**. A service named **Postgres** appears. Keep that name (the settings below refer to it).

## 3. Create the `api` service

1. In the project: **Create -> GitHub Repo -> vijay-5s**. Allow Railway to access the repo if asked.
2. Click the new service -> **Settings**:
   - **Service name**: `api` (exactly this; the web service finds it by this name)
   - **Source -> Root Directory**: `/backend`
   - **Config-as-code -> Railway Config File**: `/backend/railway.json`
   - **Networking**: do **not** generate a public domain. It only needs the private network.
3. **Variables** tab -> **Raw Editor**, paste this and fill in the `<...>` parts:

```
ENV=production
PORT=8000
DATABASE_URL=postgresql+psycopg://${{Postgres.PGUSER}}:${{Postgres.PGPASSWORD}}@${{Postgres.PGHOST}}:${{Postgres.PGPORT}}/${{Postgres.PGDATABASE}}
JWT_SECRET=<64-character random value, see below>
CORS_ORIGINS=<web public URL from step 5, e.g. https://web-production-xxxx.up.railway.app>
SEED_ON_START=true
SEED_DEMO_DATA=false
ADMIN_EMP_ID=<the Super Admin login ID you chose, e.g. 5sadmin>
ADMIN_PASSWORD=<a strong password you choose - NOT admin123>
DEFAULT_USER_PASSWORD=<starting password for new users - NOT vijay123>
SUPABASE_URL=<https://your-project-ref.supabase.co>
SUPABASE_SERVICE_KEY=<Supabase service_role secret key>
SUPABASE_BUCKET=5sphotos
```

Notes on each value:
- **DATABASE_URL**: copy the line exactly as shown. Railway fills in the `${{Postgres...}}` parts itself. Do not use Railway's ready-made `${{Postgres.DATABASE_URL}}`: the app needs the `postgresql+psycopg://` start.
- **JWT_SECRET**: signs everyone's login. Generate it on your PC with
  `python -c "import secrets; print(secrets.token_urlsafe(48))"` and paste the output. Never reuse the one in `backend/.env`.
- **SEED_DEMO_DATA=false**: only the admin account is created - no fake demo users, zones or issues.
- **ADMIN_PASSWORD**: the first Super Admin login. Keep it in the plant password register, not in chat or email.
- **ADMIN_EMP_ID**: the login ID for the first Super Admin. Upper/lower case does not matter at login.
- **SUPABASE_SERVICE_KEY**: Supabase dashboard -> Project Settings -> API Keys -> **Secret keys** section (starts with `sb_secret_`). Never use the publishable/anon key. The bucket `5sphotos` must exist and be set to **Public**.
- **CORS_ORIGINS**: leave as a placeholder for now; you fill it in at step 5.

4. Click **Deploy**. Under **Deployments -> View logs** you should see the migrations run and then `Uvicorn running on http://[::]:8000`.

## 4. Create the `web` service

1. **Create -> GitHub Repo -> vijay-5s** again.
2. **Settings**:
   - **Service name**: `web`
   - **Source -> Root Directory**: `/frontend`
   - **Config-as-code -> Railway Config File**: `/frontend/railway.json`
3. **Variables** -> add one variable:

```
API_UPSTREAM=${{api.RAILWAY_PRIVATE_DOMAIN}}:8000
```

4. Deploy. The logs should show `15-dns-resolver.sh: using DNS ...` and nginx starting.

## 5. Get the public link

1. `web` service -> **Settings -> Networking -> Generate Domain**. If asked for a port, accept the one Railway suggests.
2. Copy the URL (looks like `https://web-production-xxxx.up.railway.app`).
3. Go back to **api -> Variables**, set `CORS_ORIGINS` to that exact URL (no trailing `/`). The api redeploys by itself.

## 6. First login and checks

1. Open the web URL on a PC. Log in with the `ADMIN_EMP_ID` and `ADMIN_PASSWORD` you set.
2. Check the live indicator in the top bar shows connected.
3. Open the site in a second tab, raise a test issue in one tab - it should appear in the other without refreshing.
4. Close the test issue with a photo from a phone - confirms photo upload to Supabase works.
5. Add the pilot users from the **Users** page and give them the link.
6. Set **api -> Variables -> SEED_ON_START=false** (the admin now exists; this stops start-up seeding).

## 7. During the pilot

- **Do not redeploy during the pilot unless something is broken.** Every push to GitHub `main` redeploys both services, and users are logged out of live updates for about a minute. Make changes on another branch until the pilot ends.
- Never delete the **Postgres** service - that deletes all data.
- If something misbehaves: open the service -> **Deployments -> View logs**, take a screenshot, and send it to the developer.

### Take a database backup (always before any redeploy)

1. Install the PostgreSQL command-line tools on your PC (https://www.postgresql.org/download/windows/ - in the installer you can tick only "Command Line Tools"). Use the newest version.
2. Railway -> **Postgres -> Variables** -> copy **DATABASE_PUBLIC_URL** (keep it private).
3. In PowerShell:

```powershell
$env:PGURL = "<paste DATABASE_PUBLIC_URL here>"
pg_dump $env:PGURL --format=custom --file "E:\vijay-5s-backups\vijay5s-$(Get-Date -Format yyyyMMdd-HHmm).dump"
```

(Create the folder `E:\vijay-5s-backups` first.) A file of a few hundred KB or more means it worked. Railway also offers **Postgres -> Backups** on paid plans; turn it on if available.

To restore (only with the developer): `pg_restore --clean --no-owner -d $env:PGURL <file>.dump`

## Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| Web page shows "502 Bad Gateway" | `api` is not running or not named `api`. Check api logs; check `API_UPSTREAM` and that api has `PORT=8000`. |
| api logs: "Can't load plugin: sqlalchemy.dialects:postgres" or psycopg2 error | `DATABASE_URL` does not start with `postgresql+psycopg://`. Re-copy the line from step 3. |
| Login works but live indicator stays offline | Hard refresh (Ctrl+F5). If it persists, send the web logs to the developer. |
| Photo upload fails | Check `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` and that bucket `5sphotos` exists. |
| Refreshing a page like `/audit/12` shows 404 | The web service is not using `frontend/Dockerfile`; check Root Directory is `/frontend`. |
