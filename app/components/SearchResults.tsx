import Link from 'next/link'
import { Suspense } from 'react'
import prisma from '@/lib/prisma'
import PageSizeSelector from './PageSizeSelector'
import SpeakerLink from './SpeakerLink'
import ClickableCard from './ClickableCard'

interface Props {
  q: string
  showId?: string
  season?: string
  episodeId?: string
  speakerName?: string
  page?: string
  limit?: string
}

function buildClipUrl(clipId: number, q: string, showId?: string, season?: string, episodeId?: string, speakerName?: string) {
  const params = new URLSearchParams()
  if (q) params.set('q', q)
  if (showId) params.set('showId', showId)
  if (season) params.set('season', season)
  if (episodeId) params.set('episodeId', episodeId)
  if (speakerName) params.set('speakerName', speakerName)
  return `/clip/${clipId}?${params.toString()}`
}

function buildPageUrl(q: string, page: number, limit: number, showId?: string, season?: string, episodeId?: string, speakerName?: string) {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) })
  if (q) params.set('q', q)
  if (showId) params.set('showId', showId)
  if (season) params.set('season', season)
  if (episodeId) params.set('episodeId', episodeId)
  if (speakerName) params.set('speakerName', speakerName)
  return `/?${params.toString()}`
}

export default async function SearchResults({ q, showId, season, episodeId, speakerName, page: pageStr, limit: limitStr }: Props) {
  if (q.length < 2 && !episodeId && !speakerName) {
    return <p className="mt-8 text-gray-400 text-sm">Enter a quote, speaker, or select an episode to search.</p>
  }

  const limit = Math.min(Math.max(Number(limitStr) || 10, 1), 100)
  const page = Math.max(Number(pageStr) || 1, 1)

  const matchingQuotes = await prisma.quote.findMany({
    where: {
      ...(q.length >= 2 ? { text: { contains: q } } : {}),
      ...(speakerName ? { speaker: { name: { contains: speakerName } } } : {}),
      ...(showId || season || episodeId ? {
        episode: {
          ...(episodeId ? { id: Number(episodeId) } : {
            ...(showId ? { showId: Number(showId) } : {}),
            ...(season ? { season: Number(season) } : {}),
          }),
        }
      } : {}),
    },
    select: { clipId: true },
    distinct: ['clipId'],
  })

  const totalClips = matchingQuotes.length
  const totalPages = Math.ceil(totalClips / limit)
  const clampedPage = Math.min(page, totalPages || 1)
  const clipIds = matchingQuotes.map(r => r.clipId)

  const clips = await prisma.clip.findMany({
    where: { id: { in: clipIds } },
    include: {
      episode: { include: { show: true } },
      quotes: {
        include: { speaker: true },
        orderBy: { sequence: 'asc' },
      },
    },
    orderBy: [
      { episode: { season: 'asc' } },
      { episode: { episodeNumber: 'asc' } },
      { id: 'asc' },
    ],
    skip: (clampedPage - 1) * limit,
    take: limit,
  })

  if (totalClips === 0) {
    return <p className="mt-8 text-gray-400 text-sm">No results for &ldquo;{q}&rdquo;</p>
  }

  const lowerQ = q.toLowerCase()

  return (
    <div className="mt-8 space-y-4">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
        <p className="text-sm font-semibold" style={{ color: '#1B4F72' }}>
          {totalClips} clip{totalClips !== 1 ? 's' : ''} found
          {totalPages > 1 && <span style={{ fontWeight: 400 }}> — page {clampedPage} of {totalPages}</span>}
        </p>
        <Suspense>
          <PageSizeSelector current={limit} />
        </Suspense>
      </div>

      {clips.map(clip => {
        const ep = clip.episode
        const quotes = clip.quotes
        const matchIndices = quotes
          .map((qt, i) => qt.text.toLowerCase().includes(lowerQ) ? i : -1)
          .filter(i => i !== -1)
        const visibleIndices = new Set<number>()
        for (const mi of matchIndices) {
          if (mi > 0) visibleIndices.add(mi - 1)
          visibleIndices.add(mi)
          if (mi < quotes.length - 1) visibleIndices.add(mi + 1)
        }
        const visibleQuotes = quotes.filter((_, i) => visibleIndices.has(i))

        return (
          <ClickableCard key={clip.id} href={buildClipUrl(clip.id, q, showId, season, episodeId, speakerName)}>
              <div style={{ background: '#FED90F', borderBottom: '2px solid #1a1a1a', padding: '0.4rem 1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 700, fontSize: '0.875rem', color: '#1a1a1a' }}>
                  {ep.show.name} &mdash; S{ep.season}E{ep.episodeNumber} &ldquo;{ep.title}&rdquo;
                </span>
              </div>
              <div>
                {visibleQuotes.map((quote, i) => {
                  const isMatch = quote.text.toLowerCase().includes(lowerQ)
                  return (
                    <div
                      key={quote.id}
                      style={{
                        padding: '0.4rem 1rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.75rem',
                        fontSize: '0.875rem',
                        background: isMatch ? '#FFFBCC' : i % 2 === 0 ? '#fff' : '#fafafa',
                        borderTop: i > 0 ? '1px solid #e5e5e5' : undefined,
                      }}
                    >
                      <SpeakerLink
                        id={quote.speaker?.id ?? null}
                        name={quote.speaker?.name ?? null}
                        imageUrl={quote.speaker?.imageUrl ?? null}
                        imagePosition={quote.speaker?.imagePosition ?? null}
                        isMatch={isMatch}
                      />
                      <span style={{ fontWeight: isMatch ? 600 : 400, color: isMatch ? '#1a1a1a' : '#444' }}>
                        {quote.text}
                      </span>
                    </div>
                  )
                })}
              </div>
          </ClickableCard>
        )
      })}

      {totalPages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem', paddingTop: '0.5rem' }}>
          {clampedPage > 1 ? (
            <Link href={buildPageUrl(q, clampedPage - 1, limit, showId, season, episodeId, speakerName)} style={{ textDecoration: 'none', border: '2px solid #1a1a1a', padding: '0.3rem 0.8rem', borderRadius: '6px', background: '#FED90F', fontWeight: 700, fontSize: '0.875rem', color: '#1a1a1a', boxShadow: '2px 2px 0 #1a1a1a' }}>
              ← Prev
            </Link>
          ) : (
            <span style={{ border: '2px solid #ccc', padding: '0.3rem 0.8rem', borderRadius: '6px', background: '#f5f5f5', fontWeight: 700, fontSize: '0.875rem', color: '#aaa' }}>← Prev</span>
          )}
          <span style={{ fontSize: '0.875rem', color: '#1B4F72', fontWeight: 600 }}>{clampedPage} / {totalPages}</span>
          {clampedPage < totalPages ? (
            <Link href={buildPageUrl(q, clampedPage + 1, limit, showId, season, episodeId, speakerName)} style={{ textDecoration: 'none', border: '2px solid #1a1a1a', padding: '0.3rem 0.8rem', borderRadius: '6px', background: '#FED90F', fontWeight: 700, fontSize: '0.875rem', color: '#1a1a1a', boxShadow: '2px 2px 0 #1a1a1a' }}>
              Next →
            </Link>
          ) : (
            <span style={{ border: '2px solid #ccc', padding: '0.3rem 0.8rem', borderRadius: '6px', background: '#f5f5f5', fontWeight: 700, fontSize: '0.875rem', color: '#aaa' }}>Next →</span>
          )}
        </div>
      )}
    </div>
  )
}
