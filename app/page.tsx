export const dynamic = 'force-dynamic'

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
  const simpsons = shows.find(s => s.name.toUpperCase().includes('SIMPSONS'))
  const scrubs = shows.find(s => s.name.toUpperCase().includes('SCRUBS'))
  const office = shows.find(s => s.name.toUpperCase().includes('OFFICE'))
  const episodes = simpsons ? await prisma.episode.findMany({
    where: { showId: simpsons.id },
    select: { id: true, showId: true, season: true, episodeNumber: true, title: true },
    orderBy: [{ season: 'asc' }, { episodeNumber: 'asc' }],
  }) : []
  const speakers = simpsons ? await prisma.speaker.findMany({
    where: { showId: simpsons.id },
    select: { id: true, showId: true, name: true },
    orderBy: { name: 'asc' },
  }) : []

  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(180deg, #87CEEB 0%, #B0E0FF 100%)' }}>
      <SiteHeader
        userName={session?.user?.name}
        userImage={session?.user?.image}
        isAdmin={(session?.user as { role?: string })?.role === 'ADMIN'}
        subtitle={<span style={{ fontFamily: 'var(--font-bangers)', fontSize: '1.1rem', letterSpacing: '0.03em' }}>The Simpsons</span>}
      />

      <main className="max-w-4xl mx-auto px-4 py-8">
        <Suspense>
          <SearchForm shows={shows} episodes={episodes} speakers={speakers} lockedShowId={simpsons?.id} />
        </Suspense>

        {(params.q || params.episodeId || params.speakerName) && (
          <Suspense fallback={<p className="mt-8" style={{ color: '#1B4F72' }}>Searching...</p>}>
            <SearchResults q={params.q ?? ''} showId={simpsons ? String(simpsons.id) : params.showId} season={params.season} episodeId={params.episodeId} speakerName={params.speakerName} page={params.page} limit={params.limit} />
          </Suspense>
        )}

        {!(params.q || params.episodeId || params.speakerName) && (
          <div style={{ marginTop: '2.5rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.5rem' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.6rem' }}>
                Try searching for
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'center' }}>
                {["don't have a cow", "d'oh", "excellent", "eat my shorts", "embiggens", "kwyjibo"].map(example => (
                  <a
                    key={example}
                    href={`/?q=${encodeURIComponent(example)}`}
                    style={{
                      padding: '0.3rem 0.75rem', background: 'white',
                      border: '1px solid #ccc', borderRadius: '20px',
                      fontSize: '0.8rem', textDecoration: 'none', color: '#444',
                    }}
                  >
                    {example}
                  </a>
                ))}
              </div>
            </div>
            {simpsons && (
              <a
                href={`/show/${simpsons.id}`}
                style={{
                  display: 'block', padding: '0.75rem 2rem', background: 'white',
                  border: '2px solid #1a1a1a', borderRadius: '8px', boxShadow: '3px 3px 0 #1a1a1a',
                  fontWeight: 700, fontSize: '1rem', textDecoration: 'none', color: '#1a1a1a',
                }}
              >
                Browse all episodes →
              </a>
            )}
            {scrubs && (
              <a href="/scrubs" style={{ fontSize: '0.75rem', color: '#888', textDecoration: 'underline' }}>
                Also search Scrubs
              </a>
            )}
            {office && (
              <a href="/office" style={{ fontSize: '0.75rem', color: '#888', textDecoration: 'underline' }}>
                Also search The Office
              </a>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
