import { Suspense } from 'react'
import Link from 'next/link'
import prisma from '@/lib/prisma'
import SearchForm from './components/SearchForm'
import SearchResults from './components/SearchResults'
import GamesMenu from './components/GamesMenu'
import SignOutButton from './components/SignOutButton'
import { auth } from '@/auth'

interface PageProps {
  searchParams: Promise<{ q?: string; showId?: string; season?: string; episodeId?: string; speakerName?: string; page?: string; limit?: string }>
}

export default async function HomePage({ searchParams }: PageProps) {
  const params = await searchParams
  const session = await auth()
  const shows = await prisma.show.findMany({ orderBy: { name: 'asc' } })
  const episodes = await prisma.episode.findMany({
    select: { id: true, showId: true, season: true, episodeNumber: true, title: true },
    orderBy: [{ showId: 'asc' }, { season: 'asc' }, { episodeNumber: 'asc' }],
  })
  const speakers = await prisma.speaker.findMany({
    select: { id: true, showId: true, name: true },
    orderBy: { name: 'asc' },
  })

  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(180deg, #87CEEB 0%, #B0E0FF 100%)' }}>
      {/* Header bar */}
      <header style={{ background: '#FED90F', borderBottom: '4px solid #1a1a1a' }}>
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-end gap-3">
          <h1
            style={{ fontFamily: 'var(--font-bangers)', fontSize: '3rem', letterSpacing: '0.05em', color: '#1a1a1a', lineHeight: 1, textShadow: '2px 2px 0 #fff' }}
          >
            SayWhatNow
          </h1>
          <p style={{ color: '#5a3e00', fontSize: '0.85rem', paddingBottom: '0.3rem' }}>
            Search quotes from The Simpsons, Futurama &amp; Scrubs
          </p>
          <div style={{ marginLeft: 'auto', paddingBottom: '0.3rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <GamesMenu />
            {(session?.user as { role?: string })?.role === 'ADMIN' && (
              <Link
                href="/admin/staging"
                style={{ fontSize: '0.8rem', fontWeight: 600, background: '#1a1a1a', color: '#FED90F', padding: '0.25rem 0.6rem', borderRadius: '4px', textDecoration: 'none' }}
              >
                Admin
              </Link>
            )}
            <SignOutButton name={session?.user?.name} image={session?.user?.image} />
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        <Suspense>
          <SearchForm shows={shows} episodes={episodes} speakers={speakers} />
        </Suspense>

        {(params.q || params.episodeId || params.speakerName) && (
          <Suspense fallback={<p className="mt-8" style={{ color: '#1B4F72' }}>Searching...</p>}>
            <SearchResults q={params.q ?? ''} showId={params.showId} season={params.season} episodeId={params.episodeId} speakerName={params.speakerName} page={params.page} limit={params.limit} />
          </Suspense>
        )}

        {!(params.q || params.episodeId || params.speakerName) && (
          <p className="mt-12 text-center text-sm" style={{ color: '#1B4F72' }}>D&apos;oh! Enter a quote to search.</p>
        )}
      </main>
    </div>
  )
}
