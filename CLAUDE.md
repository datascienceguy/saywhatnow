# SayWhatNow — Architecture & Codebase Guide

A quote-search web app for TV shows (The Simpsons, Futurama, Scrubs). Users search for dialogue across episodes; results surface the full clip context with matching lines highlighted.

---

## Tech Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS v4 |
| ORM | Prisma 7 with `better-sqlite3` adapter |
| Database | SQLite (local dev); planned migration to Postgres |
| Auth | next-auth v5 (beta) — wired up but not yet implemented |

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

> **Note:** `Clip.keywords` is a comma-separated string — this is a SQLite workaround. Migrate to a proper array/relation when moving to Postgres.

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
  migrate-legacy.ts         # One-time migration: reads legacy `swn_videos_new.sql` dump → populates dev.db
```

---

## Search Logic

Search is implemented in two places (both do the same thing):

1. **`SearchResults` (server component)** — used for SSR page renders
2. **`GET /api/search`** — used for client-side fetch if needed

Flow:
1. Query `Quote` table for rows where `text CONTAINS q`, optionally filtered by showId / season
2. Collect distinct `clipId`s (max 30 clips)
3. Fetch full `Clip` records including all quotes and episode/show metadata
4. Mark each quote with `isMatch: true` if it contains the search term
5. Results ordered by season → episode → clip id

---

## Key Notes

- **SearchResults duplicates the API route logic** — both hit Prisma directly. If search logic evolves, update both.
- **SQLite → Postgres migration planned** — `Clip.keywords` and any `contains` queries will need updating (Prisma `contains` is case-insensitive on Postgres, case-sensitive on SQLite).
- **`scripts/migrate-legacy.ts`** reads a MySQL dump (`swn_videos_new.sql`) from a sibling directory `../../saywhatnow/` and uses `better-sqlite3` directly (not Prisma) to bulk-insert data.
- **next-auth** is installed but auth flows (login, sessions, protected routes) are not yet built.

---

## Running Locally

```bash
npm run dev         # start dev server
npx tsx scripts/migrate-legacy.ts   # run legacy data migration (requires source SQL file)
npx prisma studio   # browse database
```

---

*Keep this file updated as the architecture evolves.*
