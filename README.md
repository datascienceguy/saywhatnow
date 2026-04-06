# SayWhatNow

A searchable quote and clip library for The Simpsons and Scrubs.

---

## Prerequisites

### Both platforms

| Tool | Purpose | Install |
|------|---------|---------|
| **Node.js 20+** | Run the Next.js app | https://nodejs.org |
| **uv** | Run the Python import pipeline | https://docs.astral.sh/uv/getting-started/installation/ |
| **ffmpeg** | Video conversion and clip cutting | see below |
| **Git** | Source control | https://git-scm.com |

### ffmpeg

**Windows**
```powershell
winget install Gyan.FFmpeg
```
Then open a new terminal — the process-episode script will find it automatically.

**Mac**
```bash
brew install ffmpeg
```

---

## First-time setup

### 1. Clone and install

```bash
git clone https://github.com/datascienceguy/saywhatnow
cd saywhatnow-next
npm install
```

### 2. Create `.env.local`

Copy the values from another team member or the shared credentials store. The file lives at the repo root and is gitignored.

```
AUTH_SECRET=
AUTH_GOOGLE_ID=
AUTH_GOOGLE_SECRET=
AUTH_URL=http://localhost:3000

INTERNAL_API_SECRET=

NEXT_PUBLIC_CLIPS_BASE_URL=https://pub-48025b1c83a04e9d9e14e3ed7abf326c.r2.dev

R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_ACCOUNT_ID=
R2_BUCKET_NAME=saywhatnow-clips

ANTHROPIC_API_KEY=

# Optional — enables auto-push to prod DB on finalize
PROD_API_URL=https://saywhatnow.fly.dev
```

### 3. Set up the database

The SQLite database is not committed to the repo. Get `prisma/dev.db` from another team member, or run the legacy migration to seed it from scratch:

```bash
npx tsx scripts/migrate-legacy.ts
```

### 4. Install Playwright (one-time, for transcript downloads)

```bash
uv run --with playwright playwright install chromium
```

### 5. Start the dev server

```bash
npm run dev
```

Open http://localhost:3000. Sign in with a Google account that is on the allowlist in `AUTH_ALLOWED_EMAILS`.

---

## Importing a new episode

The full workflow to add an episode to the library:

### Step 1 — Run the import script

With the dev server running in one terminal, open another and run:

```bash
uv run scripts/process-episode.py --season 4 --episode 8
```

This will:
1. Download the MKV from archive.org
2. Download the transcript from foreverdreaming (falls back to nohomers.net scripts if speaker coverage is low)
3. Convert to MP4
4. Match transcript lines to SRT timestamps
5. Use Claude to suggest clip boundaries
6. Create a staging episode at `/admin/staging`

Files are cached under `clip_prep/s04e08/` — re-running skips steps whose output already exists.

**Note:** The first run downloads a full-episode MKV (~1–2 GB) and converts it to MP4, which can take several minutes.

### Step 2 — Split clips in the staging editor

Go to http://localhost:3000/admin/staging and open the episode. The video player and quote list let you:
- Review the AI-suggested clip boundaries
- Drag split markers to adjust timing
- Click any speaker name or quote text to edit it
- Add or remove splits as needed

Changes auto-save every 2 seconds.

### Step 3 — Finalize

Click **Finalize**. This will:
- Cut the individual clip MP4s with ffmpeg
- Upload them to Cloudflare R2
- Import clips, quotes, and speakers into the local database
- Push to the production database (if `PROD_API_URL` is set)

### Step 4 — Review speakers

Go to `/admin/speakers`, find the speakers from the episode, and:
- Fix any duplicate or misspelled names
- Set speaker types (Main, Recurring, Guest, etc.)
- Add portrait photos (use **Find photo** to auto-fetch from the Simpsons wiki)

### Step 5 — Spot-check

Search a quote from the episode on the main site and confirm the video plays correctly.

---

## Common commands

```bash
npm run dev                                    # start dev server
npx prisma studio                             # browse the database
npx prisma generate                           # regenerate types after schema changes
uv run scripts/process-episode.py --season 1 --episode 1   # import S1E1
```

---

## Windows-specific notes

- Use **Git Bash** or **Windows Terminal** for the commands above — PowerShell works too but some uv commands behave differently
- ffmpeg installed via WinGet is found automatically by the import script; no PATH change needed
- The `sync-db-to-fly.bat` script syncs the local SQLite database to the production server

## Mac-specific notes

- Install Homebrew first if you don't have it: https://brew.sh
- `uv` can be installed via Homebrew: `brew install uv`
- ffmpeg: `brew install ffmpeg`
