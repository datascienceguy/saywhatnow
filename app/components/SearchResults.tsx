import Link from 'next/link'
import { Suspense } from 'react'
import prisma from '@/lib/prisma'
import PageSizeSelector from './PageSizeSelector'
import SpeakerLink from './SpeakerLink'
import ClickableCard from './ClickableCard'
import { toTitleCase } from '@/lib/display'

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

function highlightText(text: string, q: string): React.ReactNode {
  if (!q || q.length < 2) return text
  const idx = text.toLowerCase().indexOf(q.toLowerCase())
  if (idx === -1) return text
  return (
    <>
      {text.slice(0, idx)}
      <mark style={{ background: '#FED90F', borderRadius: '2px', padding: '0 1px', fontWeight: 700, color: '#1a1a1a' }}>
        {text.slice(idx, idx + q.length)}
      </mark>
      {text.slice(idx + q.length)}
    </>
  )
}

export default async function SearchResults({ q, showId, season, episodeId, speakerName, page: pageStr, limit: limitStr }: Props) {
  if (q.length < 2 && !episodeId && !speakerName) {
    return <p style={{ marginTop: '2rem', color: '#888', fontSize: '0.875rem' }}>Enter a quote, speaker, or select an episode to search.</p>
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
    return (
      <div style={{ marginTop: '2rem', textAlign: 'center', padding: '3rem 1rem' }}>
        <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🔍</div>
        <p style={{ color: '#555', fontSize: '0.9375rem', margin: 0 }}>No results for <strong>&ldquo;{q}&rdquo;</strong></p>
        <p style={{ color: '#999', fontSize: '0.8125rem', marginTop: '0.25rem' }}>Try different keywords or check your filters.</p>
      </div>
    )
  }

  const lowerQ = q.toLowerCase()

  return (
    <div style={{ marginTop: '1.5rem' }}>
      {/* Results meta */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem' }}>
        <p style={{ fontSize: '0.8125rem', color: '#555', margin: 0 }}>
          <strong style={{ color: '#1a1a1a' }}>{totalClips.toLocaleString()}</strong> clip{totalClips !== 1 ? 's' : ''} found
          {totalPages > 1 && <span style={{ color: '#888' }}> &mdash; page {clampedPage} of {totalPages}</span>}
        </p>
        <Suspense>
          <PageSizeSelector current={limit} />
        </Suspense>
      </div>

      {/* Result cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
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
              {/* Episode header */}
              <div style={{ padding: '0.5rem 0.875rem', borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                <span style={{ background: '#FED90F', border: '1px solid #e6c400', borderRadius: '4px', padding: '0.1rem 0.45rem', fontSize: '0.6875rem', fontWeight: 700, color: '#1a1a1a', whiteSpace: 'nowrap', letterSpacing: '0.02em' }}>
                  {ep.show.name}
                </span>
                <span style={{ fontSize: '0.8125rem', color: '#444', fontWeight: 500 }}>
                  S{ep.season}E{ep.episodeNumber}
                </span>
                <span style={{ fontSize: '0.8125rem', color: '#777' }}>
                  &ldquo;{toTitleCase(ep.title)}&rdquo;
                </span>
              </div>

              {/* Quotes */}
              <div>
                {visibleQuotes.map((quote, i) => {
                  const isMatch = q.length >= 2 && quote.text.toLowerCase().includes(lowerQ)
                  return (
                    <div
                      key={quote.id}
                      style={{
                        padding: '0.45rem 0.875rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.625rem',
                        borderTop: i > 0 ? '1px solid #f3f3f3' : undefined,
                        background: isMatch ? '#FFFDF0' : 'transparent',
                      }}
                    >
                      <SpeakerLink
                        id={quote.speaker?.id ?? null}
                        name={quote.speaker?.name ?? null}
                        imageUrl={quote.speaker?.imageUrl ?? null}
                        imagePosition={quote.speaker?.imagePosition ?? null}
                        isMatch={isMatch}
                        compact
                      />
                      <span style={{
                        fontSize: '0.8125rem',
                        color: isMatch ? '#1a1a1a' : '#666',
                        lineHeight: 1.45,
                        flex: 1,
                        letterSpacing: '0.01em',
                        fontWeight: isMatch ? 500 : 400,
                      }}>
                        {isMatch ? highlightText(quote.text, q) : quote.text}
                      </span>
                    </div>
                  )
                })}
              </div>
            </ClickableCard>
          )
        })}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', paddingTop: '1.5rem', paddingBottom: '1rem' }}>
          {clampedPage > 1 ? (
            <Link
              href={buildPageUrl(q, clampedPage - 1, limit, showId, season, episodeId, speakerName)}
              style={{ textDecoration: 'none', padding: '0.375rem 0.875rem', background: 'white', border: '1.5px solid #d0d0d0', borderRadius: '6px', fontSize: '0.875rem', color: '#333', fontWeight: 600 }}
            >
              ← Prev
            </Link>
          ) : (
            <span style={{ padding: '0.375rem 0.875rem', background: '#f5f5f5', border: '1.5px solid #e5e5e5', borderRadius: '6px', fontSize: '0.875rem', color: '#bbb', fontWeight: 600 }}>← Prev</span>
          )}
          <span style={{ fontSize: '0.8125rem', color: '#555', padding: '0 0.5rem' }}>{clampedPage} / {totalPages}</span>
          {clampedPage < totalPages ? (
            <Link
              href={buildPageUrl(q, clampedPage + 1, limit, showId, season, episodeId, speakerName)}
              style={{ textDecoration: 'none', padding: '0.375rem 0.875rem', background: 'white', border: '1.5px solid #d0d0d0', borderRadius: '6px', fontSize: '0.875rem', color: '#333', fontWeight: 600 }}
            >
              Next →
            </Link>
          ) : (
            <span style={{ padding: '0.375rem 0.875rem', background: '#f5f5f5', border: '1.5px solid #e5e5e5', borderRadius: '6px', fontSize: '0.875rem', color: '#bbb', fontWeight: 600 }}>Next →</span>
          )}
        </div>
      )}
    </div>
  )
}
