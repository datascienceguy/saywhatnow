export const dynamic = 'force-dynamic'

import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import prisma from '@/lib/prisma'
import SearchForm from '../components/SearchForm'
import SearchResults from '../components/SearchResults'
import SiteHeader from '../components/SiteHeader'
import { auth } from '@/auth'

interface PageProps {
  searchParams: Promise<{ q?: string; season?: string; episodeId?: string; speakerName?: string; page?: string; limit?: string }>
}

export default async function ScrubsPage({ searchParams }: PageProps) {
  const params = await searchParams
  const session = await auth()

  const scrubs = await prisma.show.findFirst({ where: { name: { contains: 'SCRUBS' } } })
  if (!scrubs) return notFound()

  const [episodes, speakers] = await Promise.all([
    prisma.episode.findMany({
      where: { showId: scrubs.id },
      select: { id: true, showId: true, season: true, episodeNumber: true, title: true },
      orderBy: [{ season: 'asc' }, { episodeNumber: 'asc' }],
    }),
    prisma.speaker.findMany({
      where: { showId: scrubs.id },
      select: { id: true, showId: true, name: true },
      orderBy: { name: 'asc' },
    }),
  ])

  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(180deg, #87CEEB 0%, #B0E0FF 100%)' }}>
      <SiteHeader
        userName={session?.user?.name}
        userImage={session?.user?.image}
        isAdmin={(session?.user as { role?: string })?.role === 'ADMIN'}
        subtitle="Search Scrubs quotes"
      />

      <main className="max-w-4xl mx-auto px-4 py-8">
        <Suspense>
          <SearchForm
            shows={[scrubs]}
            episodes={episodes}
            speakers={speakers}
            lockedShowId={scrubs.id}
            searchPath="/scrubs"
          />
        </Suspense>

        {(params.q || params.episodeId || params.speakerName) && (
          <Suspense fallback={<p className="mt-8" style={{ color: '#1B4F72' }}>Searching...</p>}>
            <SearchResults
              q={params.q ?? ''}
              showId={String(scrubs.id)}
              season={params.season}
              episodeId={params.episodeId}
              speakerName={params.speakerName}
              page={params.page}
              limit={params.limit}
            />
          </Suspense>
        )}

        {!(params.q || params.episodeId || params.speakerName) && (
          <div style={{ marginTop: '3rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
            <a
              href={`/show/${scrubs.id}`}
              style={{
                display: 'block', padding: '0.75rem 2rem', background: 'white',
                border: '2px solid #1a1a1a', borderRadius: '8px', boxShadow: '3px 3px 0 #1a1a1a',
                fontWeight: 700, fontSize: '1rem', textDecoration: 'none', color: '#1a1a1a',
              }}
            >
              Browse all Scrubs episodes →
            </a>
            <a href="/" style={{ fontSize: '0.75rem', color: '#888', textDecoration: 'underline' }}>
              Back to Simpsons
            </a>
          </div>
        )}
      </main>
    </div>
  )
}
