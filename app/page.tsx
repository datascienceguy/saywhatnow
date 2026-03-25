import { Suspense } from 'react'
import prisma from '@/lib/prisma'
import SearchForm from './components/SearchForm'
import SearchResults from './components/SearchResults'
import SiteHeader from './components/SiteHeader'
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
      <SiteHeader
        userName={session?.user?.name}
        userImage={session?.user?.image}
        isAdmin={(session?.user as { role?: string })?.role === 'ADMIN'}
        subtitle="Search quotes from The Simpsons, Futurama & Scrubs"
      />

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
