# Deploying the Vijay 5S Console to Render (10-day pilot)

> This replaces the earlier Railway instructions. Railway paused free trials for new
> accounts, so the pilot now runs on **Render.com**'s free tier instead. The app code did
> not change - only where it is hosted.

What you will end up with, all under one Render account:

| Service | What it is | Public? |
|---|---|---|
| **vijay5s-db** | The database (Render free PostgreSQL) | No |
| **vijay5s-api** | The FastAPI backend, built from `backend/` | Yes, but only the developer needs the link |
| **vijay5s-web** | The website (nginx), built from `frontend/`. It forwards `/api`, `/uploads` and `/ws` to **vijay5s-api** | Yes - this is the link users open |

Photos are stored in Supabase Storage, so no Render disk is needed. Never paste real passwords or keys into this file.

**Two Render free-tier limits to know about before you start - both are fine for a 10-day pilot, but plan around them:**

1. **Free services go to sleep.** Both `vijay5s-api` and `vijay5s-web` spin down automatically after 15 minutes with no traffic. The *first* visit after a quiet spell (e.g. first thing each morning) wakes them back up, which takes up to about **a minute** - the page may look blank or stuck loading during that time. This is a one-time pause, not a fault. Tell pilot users: "If the site seems stuck the first time you open it today, wait a minute and it will load."
2. **Free Postgres expires after 90 days.** Render deletes free databases automatically 90 days after creation. A 10-day pilot will never hit this, but if the pilot is extended, see **"If the free database is about to expire"** near the end of this file.

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

## 2. Create the Render Blueprint

The repo already contains a file called `render.yaml` at the top level. This tells Render how to
build both services and the database in one go, with fixed names so the website link is known
in advance (no fiddling with addresses after the fact).

1. Sign in at https://render.com (you can sign in with your GitHub account).
2. Click **New -> Blueprint**.
3. Pick the `vijay-5s` GitHub repository (authorize Render to see it if asked).
4. Render reads `render.yaml` and shows you a preview with three resources: `vijay5s-db`,
   `vijay5s-api`, `vijay5s-web`. Click **Apply**.
5. Render will ask you to fill in a short list of secret values before the first deploy (because
   `render.yaml` deliberately leaves these blank rather than storing them in the repo). Fill in:

```
JWT_SECRET=<64-character random value, see below>
ADMIN_EMP_ID=<the Super Admin login ID you chose, e.g. 5sadmin>
ADMIN_PASSWORD=<a strong password you choose - NOT admin123>
DEFAULT_USER_PASSWORD=<starting password for new users - NOT vijay123>
SUPABASE_URL=<https://your-project-ref.supabase.co>
SUPABASE_SERVICE_KEY=<Supabase service_role secret key>
```

Notes on each value:
- **JWT_SECRET**: signs everyone's login. Generate it on your PC with
  `python -c "import secrets; print(secrets.token_urlsafe(48))"` and paste the output. Never reuse the one in `backend/.env`.
- **ADMIN_EMP_ID**: the login ID for the first Super Admin. Upper/lower case does not matter at login.
- **ADMIN_PASSWORD**: the first Super Admin login. Keep it in the plant password register, not in chat or email.
- **SUPABASE_SERVICE_KEY**: Supabase dashboard -> Project Settings -> API Keys -> **Secret keys** section (starts with `sb_secret_`). Never use the publishable/anon key. The bucket `5sphotos` must exist and be set to **Public**.
- **DATABASE_URL** and **CORS_ORIGINS** are already filled in correctly by `render.yaml` itself - you do not need to touch them. (`render.yaml` fixes the website's name to `vijay5s-web`, so its link - `https://vijay5s-web.onrender.com` - is known before the first deploy, which is why CORS can be set up front with no back-and-forth.)

6. Click through to finish. Render will build and deploy `vijay5s-db`, then `vijay5s-api`, then `vijay5s-web`. The first build of each can take several minutes - watch progress under each service's **Logs** tab.

> If you ever need to change one of these values later (e.g. rotate `ADMIN_PASSWORD`), open the
> service in the Render dashboard -> **Environment** tab -> edit the value -> **Save** (this
> redeploys that service automatically).

## 3. First login and checks

1. Open `https://vijay5s-web.onrender.com` on a PC. The first open of the day may take up to a
   minute while the free services wake up - this is expected (see the note at the top of this file).
2. Log in with the `ADMIN_EMP_ID` and `ADMIN_PASSWORD` you set in step 2.
3. Check the live indicator in the top bar shows connected.
4. Open the site in a second tab, raise a test issue in one tab - it should appear in the other without refreshing.
5. Close the test issue with a photo from a phone - confirms photo upload to Supabase works.
6. Add the pilot users from the **Users** page and give them the link.
7. In the Render dashboard, open **vijay5s-api -> Environment**, set `SEED_ON_START` to `false` (the admin now exists; this stops start-up seeding), and save.

## 4. During the pilot

- **Do not redeploy during the pilot unless something is broken.** Every push to GitHub `main` redeploys both services, and users are logged out of live updates for about a minute while it restarts. Make changes on another branch until the pilot ends.
- **Remember the sleep delay.** If nobody has used the site for 15+ minutes, the next person to open it will see a slow or blank page for up to about a minute while Render wakes the services back up. This is normal on the free tier, not a bug.
- Never delete the **vijay5s-db** database - that deletes all data.
- If something misbehaves: open the service in Render -> **Logs**, take a screenshot, and send it to the developer.

### Take a database backup (always before any redeploy)

1. Install the PostgreSQL command-line tools on your PC (https://www.postgresql.org/download/windows/ - in the installer you can tick only "Command Line Tools"). Use the newest version.
2. In the Render dashboard, open **vijay5s-db -> Connect** and copy the **External Database URL** (keep it private - this is as sensitive as a password).
3. In PowerShell:

```powershell
$env:PGURL = "<paste External Database URL here>"
pg_dump $env:PGURL --format=custom --file "E:\vijay-5s-backups\vijay5s-$(Get-Date -Format yyyyMMdd-HHmm).dump"
```

(Create the folder `E:\vijay-5s-backups` first.) A file of a few hundred KB or more means it worked.

To restore (only with the developer):

```powershell
pg_restore --clean --no-owner -d $env:PGURL <file>.dump
```

### If the free database is about to expire (90-day limit)

Render deletes a free Postgres database 90 days after it was created, with no grace period, so
if the pilot runs long enough to approach that date:

1. Take a fresh backup using the steps above.
2. In Render, create a new PostgreSQL resource (same free plan, or upgrade to a paid plan if the
   pilot is becoming permanent) and note its new **External Database URL**.
3. Restore the backup into it: `pg_restore --clean --no-owner -d "<new External Database URL>" <file>.dump`
4. Open **vijay5s-api -> Environment**, update `DATABASE_URL` to the new connection string, and save (this redeploys the api automatically).
5. Confirm login and a test issue still work, then delete the old, expiring database.

## Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| Page is blank or "Not Found" for up to a minute, then loads fine | Normal free-tier wake-up delay after 15 minutes idle. Wait and reload. |
| Web page shows "502 Bad Gateway" even after waiting | `vijay5s-api` is not running. Check its **Logs** tab in Render; check `API_UPSTREAM`/`API_HOST` on `vijay5s-web` still say `vijay5s-api.onrender.com`. |
| api logs: "Can't load plugin: sqlalchemy.dialects:postgres" or psycopg2 error | `DATABASE_URL` does not start with `postgresql+psycopg://`. The app auto-corrects plain `postgres://`/`postgresql://` URLs on start, so this should not happen with the Render-provided connection string - if it does, send the logs to the developer. |
| Login works but live indicator stays offline | Hard refresh (Ctrl+F5). If it persists, send the `vijay5s-web` and `vijay5s-api` logs to the developer. |
| Photo upload fails | Check `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` and that bucket `5sphotos` exists and is Public. |
| Refreshing a page like `/audit/12` shows 404 | The `vijay5s-web` service is not using `frontend/Dockerfile`; check the Blueprint's root directory is `/frontend`. |
| CORS error in the browser console | `CORS_ORIGINS` on `vijay5s-api` must exactly match `https://vijay5s-web.onrender.com` (no trailing slash). `render.yaml` sets this automatically, so this should only come up if the web service was renamed. |

## Reference: why this differs from the old Railway setup

- Railway gave the two services a private internal address (`api.railway.internal`) so the
  website's nginx could reach the backend without going over the public internet. Render's free
  tier has no equivalent for two separate free web services, so `vijay5s-web`'s nginx instead
  proxies to the backend's normal public HTTPS address, `https://vijay5s-api.onrender.com`. This
  is simpler, not less safe: the backend only trusts requests whose Origin matches
  `CORS_ORIGINS`, exactly as before.
- `frontend/15-dns-resolver.sh` still runs but matters less here: it existed because Railway's
  private address changed on every redeploy. Render's `vijay5s-api.onrender.com` address never
  changes, so this script is now effectively a no-op safety net - harmless to keep, nothing to maintain.
- `backend/railway.json` and `frontend/railway.json` are no longer used (Render does not read
  them) and are left in the repo only for reference/history. All deploy configuration now lives
  in `render.yaml` at the repo root.
