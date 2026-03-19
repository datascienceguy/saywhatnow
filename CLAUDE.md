# SayWhatNow — Architecture & Codebase Guide

A quote-search web app for TV shows (The Simpsons, Futurama, Scrubs). Users search for dialogue across episodes; results surface the full clip context with matching lines highlighted.

The new app is a modern rewrite of a legacy PHP/MySQL app at `C:\Users\dxm27\Documents\dev\saywhatnow`. Reference that app for existing feature behavior.

---

## Tech Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS v4 |
| ORM | Prisma 7 with `better-sqlite3` adapter |
| Database | SQLite (local dev); planned migration to Postgres |
| Auth | next-auth v5 (beta) — Google OAuth, JWT sessions |

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
- **Speaker** — a character, scoped to a Show; types: MAIN, RECURRING, GUEST, ONE_TIME, OTHER; has `imageUrl` for portrait photo
- **ClipSpeaker** — join table tracking which speakers appear in a clip and how many lines they have
- **User** — username/email/password/role; present in schema but auth is handled by Google OAuth via next-auth (no password used)

> **Note:** `Clip.keywords` is a comma-separated string — SQLite workaround. Migrate to a proper array/relation in Postgres.

> **Note:** No per-quote timestamps exist in the data. The legacy app never stored when within a clip each line was spoken. Click-to-seek in the video player uses proportional estimation.

---

## File Structure

```
app/
  page.tsx                        # Home page — search UI, shows list
  login/page.tsx                  # Google sign-in page
  clip/[id]/page.tsx              # Clip detail — video player + quotes
  speaker/[id]/page.tsx           # Speaker stats page
  games/
    hangman/page.tsx              # Hangman game (server + HangmanGame.tsx client)
    match-quote/page.tsx          # Match the Quote game (server + MatchQuoteGame.tsx client)
  components/
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

auth.ts                           # NextAuth v5 config — Google provider, email allowlist
middleware.ts                     # Protects all routes, redirects to /login if unauthenticated

lib/
  prisma.ts                       # Prisma client singleton

prisma/
  schema.prisma                   # Data model
  migrations/                     # SQL migration history
  dev.db                          # Local SQLite database (gitignored)

scripts/
  migrate-legacy.ts               # One-time migration: legacy MySQL dump → dev.db

public/
  clips/                          # MP4 video clips (gitignored — copyrighted)
    simpsons/season4-season13/    # All converted (3,658 clips total)
    scrubs/season1/               # Converted (134 clips)
  pictures/                       # Speaker portrait images (703 files, lowercased)
  default-avatar.svg              # Fallback avatar for speakers without photos
```

---

## Auth

- **Provider:** Google OAuth via next-auth v5 (JWT sessions, no DB adapter)
- **Env vars:** `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `AUTH_URL`
- **Allowlist:** Set `AUTH_ALLOWED_EMAILS` (comma-separated) in `.env.local` to restrict to specific Google accounts. Leave blank to allow any Google account.
- **Middleware:** All routes protected except `/api/auth/*`, `/_next/*`, `/login`, and static assets
- **Sign-out:** Button with user avatar in every page header

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

## Video

- All clips converted from legacy FLV to MP4 using ffmpeg (`libx264 -crf 18 -preset fast`)
- `ClipViewer` renders HTML5 `<video>` with quotes side-by-side
- Click-to-seek: proportional timestamp estimation `(index / total) * clipDuration`
- Video pauses on unmount (useEffect cleanup)
- Clips stored in `public/clips/` (gitignored)

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
```

Requires `.env.local` with `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `AUTH_URL`.

---

## Feature Roadmap

### ✅ Done
- **Search** — full-text quote search, filters by show/season/episode/speaker, paginated results
- **Clip detail page** — HTML5 video player + quotes side-by-side, click-to-seek, context highlighting
- **Speaker detail page** — stats, co-speakers, quote cards linking to clips
- **Speaker portraits** — 703 images migrated from legacy app
- **Video conversion** — all 3,658 Simpsons + 134 Scrubs FLVs converted to MP4
- **Games** — Hangman, Match the Quote
- **Auth** — Google OAuth via next-auth v5, all routes protected

### 🔲 To Build

#### Quote & Clip Editing *(requires role gating)*
- Edit quote text, speaker, sequence order within a clip
- Add / delete quotes
- Upload and parse SRT/caption files to bulk-create quotes with timestamps
- Manage clip start/stop times

#### Adding New Content
- Import pipeline for new seasons: yt-dlp or disc rip → SRT from OpenSubtitles → parse + split → ffmpeg clip extraction → DB import
- SRT-based import would add per-quote timestamps (not in legacy data)

#### Episode & Speaker Management
- Add new episodes
- Add / rename / merge speakers
- Upload speaker photos

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
