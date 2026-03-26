# SayWhatNow — Architecture & Codebase Guide

A quote-search web app for TV shows (The Simpsons, Futurama, Scrubs). Users search for dialogue across episodes; results surface the full clip context with matching lines highlighted.

The new app is a modern rewrite of a legacy PHP/MySQL app at `C:\Users\dxm27\Documents\dev\saywhatnow`. Reference that app for existing feature behavior.

---

## Tech Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS v4 (admin); inline styles (main site) |
| ORM | Prisma 7 with `better-sqlite3` adapter |
| Database | SQLite (local dev); planned migration to Postgres |
| Auth | next-auth v5 (beta) — Google OAuth, JWT sessions |
| Video storage | Cloudflare R2 (`saywhatnow-clips` bucket) |

---

## Data Model (`prisma/schema.prisma`)

```
Show → Episode → Clip → Quote
             ↘         ↗
              Speaker
```

- **Show** — top-level TV show (e.g. "The Simpsons")
- **Episode** — season/episode/airdate/title, belongs to a Show
- **Clip** — a video segment within an episode (startTime/stopTime, filePath to MP4)
- **Quote** — a single line of dialogue within a clip, with a sequence number for ordering
- **Speaker** — a character, scoped to a Show; types: MAIN, RECURRING, GUEST, ONE_TIME, OTHER; has `imageUrl` and `imagePosition` (CSS object-position for focal point) for portrait photo
- **ClipSpeaker** — join table tracking which speakers appear in a clip and how many lines they have
- **User** — username/email/password/role; present in schema but auth is handled by Google OAuth via next-auth (no password used)

> **Note:** `Clip.keywords` is a comma-separated string — SQLite workaround. Migrate to a proper array/relation in Postgres.

> **Note:** No per-quote timestamps exist in the data. The legacy app never stored when within a clip each line was spoken. Click-to-seek in the video player uses proportional estimation.

> **Note:** All quote text, episode titles, and speaker names are stored in UPPERCASE.

> **Note:** `Clip.filePath` is stored without a leading slash (e.g. `clips/simpsons/season4/episode1/4-1_1.mp4`). The clip page prepends `NEXT_PUBLIC_CLIPS_BASE_URL` (R2) or `/` (local fallback).

---

## File Structure

```
app/
  page.tsx                        # Home page — search UI, shows list
  favicon.jpg                     # Site favicon (saywhatnow logo)
  login/page.tsx                  # Google sign-in page
  clip/[id]/page.tsx              # Clip detail — video player + quotes
  speaker/[id]/page.tsx           # Speaker stats page
  games/
    hangman/page.tsx              # Hangman game (server + HangmanGame.tsx client)
    match-quote/page.tsx          # Match the Quote game (server + MatchQuoteGame.tsx client)
  components/
    SiteHeader.tsx                # Server — shared header: logo + actions row + subtitle/breadcrumb row
    SearchForm.tsx                # Client — query input, show/season/episode/speaker filters
    SearchResults.tsx             # Server — Prisma query, paginated clip cards
    ClipViewer.tsx                # Client — HTML5 video player + quote list, click-to-seek
    SpeakerLink.tsx               # Client — speaker avatar + name, navigates to /speaker/[id]
    ClickableCard.tsx             # Client — card wrapper using window.location.href (avoids Next.js Link event delegation)
    BackButton.tsx                # Client — history.back()
    PageSizeSelector.tsx          # Client — 10/25/50/100 results per page
    GamesMenu.tsx                 # Client — Games dropdown nav menu
    SignOutButton.tsx             # Client — shows user avatar + sign out button
    Providers.tsx                 # Client — SessionProvider wrapper for layout
  api/
    search/route.ts               # GET /api/search — JSON search API
    games/
      hangman/route.ts            # GET — random quote for Hangman
      match-quote/route.ts        # GET — random quote + speaker choices for Match the Quote
    admin/
      staging/[id]/finalize/route.ts   # POST — SSE stream; ffmpeg clip cutting + R2 upload + DB import
      staging/[id]/clips/route.ts      # PUT — save clip splits for a staging episode
      speakers/[id]/route.ts           # PATCH — update speaker name/type/imageUrl/imagePosition
      speakers/[id]/image/route.ts     # POST — upload speaker photo to public/pictures/
      speakers/[id]/find-image/route.ts # POST — find + download speaker photo from Simpsons wiki
  admin/
    layout.tsx                    # Admin sidebar layout (client, dark theme)
    staging/page.tsx              # Episode imports list
    staging/[id]/page.tsx         # Staging editor (StagingEditor.tsx client)
    speakers/page.tsx             # Speaker list + search
    speakers/[id]/page.tsx        # Speaker edit page

auth.ts                           # NextAuth v5 config — Google provider, email allowlist
middleware.ts                     # Protects all routes; bypasses with X-Internal-Secret header

lib/
  prisma.ts                       # Prisma client singleton

prisma/
  schema.prisma                   # Data model
  migrations/                     # SQL migration history
  dev.db                          # Local SQLite database (gitignored)

scripts/
  process-episode.py              # Full episode import pipeline (download MKV + transcript, convert, stage)
  migrate-legacy.ts               # One-time migration: legacy MySQL dump → dev.db

public/
  clips/                          # EMPTY locally — all clips stored in Cloudflare R2
  pictures/                       # Speaker portrait images (lowercased filenames)
    saywhatnow.jpg                # Site logo (used in header with mix-blend-mode: multiply)
  default-avatar.svg              # Fallback avatar for speakers without photos
```

---

## Auth

- **Provider:** Google OAuth via next-auth v5 (JWT sessions, no DB adapter)
- **Env vars:** `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `AUTH_URL`
- **Allowlist:** Set `AUTH_ALLOWED_EMAILS` (comma-separated) in `.env.local` to restrict to specific Google accounts. Leave blank to allow any Google account.
- **Middleware:** All routes protected except `/api/auth/*`, `/_next/*`, `/login`, and static assets
- **Internal API bypass:** Scripts can bypass auth by setting `X-Internal-Secret` header matching `INTERNAL_API_SECRET` env var
- **Sign-out:** Button with user avatar in every page header

---

## Video / Cloudflare R2

- All clips stored in Cloudflare R2 bucket `saywhatnow-clips`
- Public URL: `https://pub-48025b1c83a04e9d9e14e3ed7abf326c.r2.dev`
- Set `NEXT_PUBLIC_CLIPS_BASE_URL` in `.env.local` to this URL
- Clip path format: `clips/{showSlug}/{seasonN}/{episodeN}/{season}-{episode}_{clipIndex}.mp4`
- Show slug: lowercased show name with "the " prefix stripped (e.g. `simpsons`, `futurama`)
- **Finalize route** cuts clips with ffmpeg, uploads to R2 via `@aws-sdk/client-s3`, deletes local file
- R2 credentials in `.env.local`: `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_ACCOUNT_ID`, `R2_BUCKET_NAME`
- To bulk upload existing clips: `aws s3 sync public/clips/ s3://saywhatnow-clips/clips/ --endpoint-url https://8907c247ae978c81e6d7c45ffb044292.r2.cloudflarestorage.com`

---

## Search

Filters: show, season, episode (dropdown), speaker name (contains match, autocomplete via datalist).
Results require either a quote (`q`), episode selection, or speaker name — not all three.
Pagination: 10/25/50/100 per page via `PageSizeSelector`.

Flow:
1. Query `Quote` where `text CONTAINS q`, filtered by showId / season / episodeId / speakerName
2. Collect distinct `clipId`s
3. Fetch full `Clip` records with quotes + episode/show metadata, paginated
4. Show ±1 context quotes around matching lines
5. Order: season → episode → clip id

---

## Header (`SiteHeader.tsx`)

Shared server component used on all public pages. Two-row layout:
- **Row 1:** Logo (links home) · Games menu · Admin button (if ADMIN role) · sign-out
- **Row 2 (optional):** Back button + subtitle/breadcrumb text (truncated with ellipsis)

Props: `userName`, `userImage`, `isAdmin`, `back` (show back button), `subtitle` (ReactNode)

---

## Episode Import Pipeline (`scripts/process-episode.py`)

Single script that handles the full import flow. Run with `uv run scripts/process-episode.py <season> <episode>`.

Steps (each auto-skipped if output already exists):
1. Download MKV from archive.org
2. Download transcript from foreverdreaming.org (via Playwright — has JS challenge)
3. Convert MKV → full MP4
4. Fetch episode metadata from thesimpsonsapi.com (paginates — ignores query params)
5. Create StagingEpisode via `POST /api/admin/staging` (with `X-Internal-Secret` header)
6. Match transcript to SRT, generate quotes, POST to staging API

All episode files stored under `clip_prep/{basename}/`.

---

## Admin Staging Editor

`/admin/staging/[id]` — StagingEditor.tsx (client component)

- Displays quotes with clip split markers
- **Auto-save:** debounced 2s after splits or episode end time changes
- **Episode end time marker:** exclude credits from last clip
- **Add quote** button before first quote and between quotes
- **Split quote** button (⧉) duplicates a quote with current video time as startTime
- **Finalize:** streams SSE progress; ffmpeg cuts clips, uploads to R2, imports to DB

---

## Speaker Management

- All speaker names stored UPPERCASE
- `imageUrl` stored as `/pictures/{filename}` (local public path)
- `imagePosition` stores CSS `object-position` value for focal point (e.g. `center top`)
- **Find photo:** searches Simpsons Fandom wiki API (`simpsons.fandom.com/api.php`), downloads image
- **Admin speakers list** (`/admin/speakers`): search, filter by show, missing-photo filter, inline find/remove photo
- **Admin speaker edit** (`/admin/speakers/[id]`): name, type, image upload, wiki photo search, 3×3 focal point picker

---

## Speaker Pages

`/speaker/[id]` shows: profile card, stats grid (quotes, words, episodes, clips, avg words/line, most active season), most repeated quote (links to clip), random quote (links to clip), co-speakers grid (via `$queryRaw` self-join on ClipSpeaker), link to search that speaker's quotes.

---

## Games

All games live under `/games/` with matching API routes under `/api/games/`.

- **Hangman** (`/games/hangman`) — Random short quote (10–45 chars), guess letters, 6 wrong guesses allowed. Speaker image revealed tile-by-tile (3×2 grid) with each wrong guess.
- **Match the Quote** (`/games/match-quote`) — Random 5+ word quote, pick the speaker from 8 choices (4×2 grid). Decoys sourced from co-speakers first, then same-show speakers. 3 guesses.

Games menu (`GamesMenu.tsx`) appears in all page headers as a dropdown.

---

## Key Notes

- **`ClickableCard`** wraps search result cards instead of Next.js `<Link>` — required because Next.js Link event delegation defeats `stopPropagation` from nested speaker links.
- **Speaker image paths** are lowercased filenames in `public/pictures/` (e.g. `homer_simpson.png`).
- **`$queryRaw`** used for co-speaker query (self-join) and game quote selection (`ORDER BY RANDOM()`).
- **`prisma generate`** must be re-run after schema changes — TypeScript types don't update automatically.
- **SQLite → Postgres migration planned** — `Clip.keywords` and `contains` queries will need updating.

---

## Running Locally

```bash
npm run dev                               # start dev server
npx tsx scripts/migrate-legacy.ts        # run legacy data migration
npx prisma studio                        # browse database
npx prisma generate                      # regenerate client after schema changes
uv run scripts/process-episode.py 1 1    # import S1E1
```

Requires `.env.local` with:
```
AUTH_SECRET, AUTH_GOOGLE_ID, AUTH_GOOGLE_SECRET, AUTH_URL
INTERNAL_API_SECRET
NEXT_PUBLIC_CLIPS_BASE_URL   # Cloudflare R2 public URL
R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ACCOUNT_ID, R2_BUCKET_NAME
```

---

## Feature Roadmap

### ✅ Done
- **Search** — full-text quote search, filters by show/season/episode/speaker, paginated results
- **Clip detail page** — HTML5 video player + quotes side-by-side, click-to-seek, context highlighting
- **Speaker detail page** — stats, co-speakers, quote cards linking to clips
- **Speaker portraits** — images migrated from legacy app + wiki auto-fetch
- **Speaker management** — admin list, edit page, focal point picker, find/upload photo
- **Video conversion** — all 3,658 Simpsons + 134 Scrubs FLVs converted to MP4
- **Video storage** — Cloudflare R2 (zero egress fees)
- **Games** — Hangman, Match the Quote
- **Auth** — Google OAuth via next-auth v5, all routes protected
- **Episode import pipeline** — `process-episode.py` downloads, transcribes, stages full episodes
- **Admin staging editor** — clip splitting, auto-save, finalize with SSE progress, R2 upload
- **Site header** — shared `SiteHeader` component with logo, breadcrumb, consistent across all pages

### 🔲 To Build

#### Quote & Clip Editing *(requires role gating)*
- Edit quote text, speaker, sequence order within a clip
- Add / delete quotes
- Upload and parse SRT/caption files to bulk-create quotes with timestamps
- Manage clip start/stop times

#### Adding New Content
- Import pipeline for Futurama and Scrubs seasons
- SRT-based import would add per-quote timestamps (not in legacy data)

#### Statistics Pages
- Episode stats — quotes per episode, season breakdown
- Show stats — season-level overview

#### Admin Panel
- User list, permission management

#### Community / Info
- FAQ, feedback form

---

## Legacy App Reference

The legacy PHP app lives at `C:\Users\dxm27\Documents\dev\saywhatnow`.
Key files:
- `scripts/sql/get_sql.php` — all read queries
- `scripts/sql/set_sql.php` — all write queries
- `scripts/editEpisode/` — episode + caption editor (SRT parsing workflow)
- `scripts/editSpeaker/` — speaker management
- `scripts/games/` — Hangman and speaker matching games
- `pictures/` — character photos
- `swn_videos_new.sql` — full MySQL data dump

*Keep this file updated as the architecture evolves.*
