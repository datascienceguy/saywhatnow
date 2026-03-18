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
| Auth | next-auth v5 (beta) — installed, not yet implemented |

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
- **Speaker** — a character, scoped to a Show; types: MAIN, RECURRING, GUEST, ONE_TIME, OTHER
- **ClipSpeaker** — join table tracking which speakers appear in a clip and how many lines they have
- **User** — username/email/password/role (GUEST default); not yet actively used

> **Note:** `Clip.keywords` is a comma-separated string — SQLite workaround. Migrate to a proper array/relation in Postgres.

---

## File Structure

```
app/
  page.tsx                  # Server component — home page, loads shows list, renders search UI
  components/
    SearchForm.tsx          # Client component — query input, show filter, season filter
    SearchResults.tsx       # Server component — runs Prisma query, renders clip cards
  api/
    search/route.ts         # GET /api/search — same search logic as SearchResults but as JSON API

lib/
  prisma.ts                 # Prisma client singleton

prisma/
  schema.prisma             # Data model
  migrations/               # SQL migration history
  dev.db                    # Local SQLite database (gitignored)

scripts/
  migrate-legacy.ts         # One-time migration: reads legacy swn_videos_new.sql → populates dev.db
```

---

## Search Logic

Search is implemented in two places (both do the same thing):

1. **`SearchResults` (server component)** — used for SSR page renders
2. **`GET /api/search`** — used for client-side fetch if needed

Flow:
1. Query `Quote` where `text CONTAINS q`, optionally filtered by showId / season
2. Collect distinct `clipId`s (max 30)
3. Fetch full `Clip` records with all quotes and episode/show metadata
4. Mark each quote with `isMatch: true` if it contains the search term
5. Order: season → episode → clip id

---

## Key Notes

- **SearchResults duplicates the API route logic** — both hit Prisma directly. If search logic evolves, update both.
- **SQLite → Postgres migration planned** — `Clip.keywords` and `contains` queries will need updating.
- **`scripts/migrate-legacy.ts`** reads a MySQL dump (`swn_videos_new.sql`) from `../../saywhatnow/` and bulk-inserts via `better-sqlite3` directly (not Prisma).
- **next-auth** is installed but auth flows (login, sessions, protected routes) are not yet built.

---

## Running Locally

```bash
npm run dev                               # start dev server
npx tsx scripts/migrate-legacy.ts        # run legacy data migration
npx prisma studio                        # browse database
```

---

## Feature Roadmap

Tracking what the legacy PHP app had and what's been built in the new stack.

### ✅ Done
- **Search** — full-text quote search filtered by show/season, returns clip context with matched lines highlighted

### 🔲 To Build

#### User Auth
- Registration, login, logout (next-auth)
- Multi-level permissions: GUEST (0), SEARCH (1), ADD_KEYWORDS (2), UPDATE_QUOTES (3), EDIT_EPISODE (7), ADMIN (9)
- Password reset via email
- User preferences (results per page)
- Request video access flow

#### Video Playback
- Clip video player (MP4 — legacy used Flash/FLV, new app will use HTML5)
- Embedded clip widget for sharing
- Embedded quotes widget

#### Quote & Clip Editing *(EDIT_EPISODE level)*
- Edit quote text, speaker, sequence order within a clip
- Add / delete quotes
- Upload and parse caption files to bulk-create quotes
- Manage clip start/stop times

#### Episode Management *(EDIT_EPISODE level)*
- Add new episodes (show, season, number, title, air date)
- Split-pane editor: video + quote editor side by side

#### Speaker Management *(ADMIN level)*
- Add / rename / delete speakers
- Merge duplicate speakers
- Speaker aliases
- Upload character photos
- Speaker photo gallery

#### Statistics Pages
- Speaker stats — quote count, appearances, seasons, character card with photo
- Episode stats — quotes per episode, season breakdown
- Show stats — season-level overview
- Filterable by show / season / speaker type

#### Games
- **Hangman** — random quote, guess the speaker letter by letter
- **Match the Quote** — given a quote, pick the speaker (beginner: multiple choice; advanced: free-form)

#### Admin Panel *(ADMIN level)*
- User list with search/filter
- Edit username, email, permission level
- Ban / unban / delete users
- Grant / deny video access with email notification

#### Community / Info
- FAQ page
- Feedback form
- News / updates feed

---

## Legacy App Reference

The legacy PHP app lives at `C:\Users\dxm27\Documents\dev\saywhatnow`.
Key files for reference:
- `scripts/sql/get_sql.php` — all read queries (3,400+ lines)
- `scripts/sql/set_sql.php` — all write queries
- `scripts/users/include/session.php` — session/auth logic
- `scripts/search/` — search UI and backend
- `scripts/editEpisode/` — episode + caption editor
- `scripts/editSpeaker/` — speaker management
- `scripts/games/` — Hangman and speaker matching games
- `scripts/stats/` — statistics pages
- `pictures/` — character photos (PNG/JPG)
- `swn_videos_new.sql` — full MySQL data dump (source for migration)

*Keep this file updated as the architecture evolves.*
