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

function highlightText(text: string, terms: string[]): React.ReactNode {
  if (terms.length === 0) return text
  const upper = text.toUpperCase()
  const ranges: { s: number; e: number }[] = []
  for (const term of terms) {
    let i = 0
    while (i < upper.length) {
      const idx = upper.indexOf(term, i)
      if (idx === -1) break
      ranges.push({ s: idx, e: idx + term.length })
      i = idx + term.length
    }
  }
  if (ranges.length === 0) return text
  ranges.sort((a, b) => a.s - b.s)
  const merged: { s: number; e: number }[] = []
  for (const r of ranges) {
    const last = merged[merged.length - 1]
    if (last && r.s <= last.e) { last.e = Math.max(last.e, r.e) }
    else merged.push({ ...r })
  }
  const nodes: React.ReactNode[] = []
  let pos = 0
  for (const { s, e } of merged) {
    if (s > pos) nodes.push(text.slice(pos, s))
    nodes.push(<mark key={s} style={{ background: '#FED90F', borderRadius: '2px', padding: '0 1px', fontWeight: 700, color: '#1a1a1a' }}>{text.slice(s, e)}</mark>)
    pos = e
  }
  if (pos < text.length) nodes.push(text.slice(pos))
  return <>{nodes}</>
}

/** Build a safe FTS5 MATCH expression from user input */
function buildFtsQuery(raw: string): string {
  // Strip apostrophes (indexed text has them removed too) and FTS5 special chars
  const sanitized = raw.replace(/'/g, '').replace(/["*^()]/g, ' ').replace(/\s+/g, ' ').trim()
  return `"${sanitized}"`
}

export default async function SearchResults({ q, showId, season, episodeId, speakerName, page: pageStr, limit: limitStr }: Props) {
  const hasTextQuery = q.trim().length >= 2
  const hasFilters = !!(episodeId || speakerName)

  if (!hasTextQuery && !hasFilters) {
    return <p style={{ marginTop: '2rem', color: '#888', fontSize: '0.875rem' }}>Enter a quote, speaker, or select an episode to search.</p>
  }

  const limit = Math.min(Math.max(Number(limitStr) || 10, 1), 100)
  const page = Math.max(Number(pageStr) || 1, 1)

  const baseFilter = {
    ...(speakerName ? { speaker: { name: { contains: speakerName.toUpperCase() } } } : {}),
    ...(showId || season || episodeId ? {
      episode: {
        ...(episodeId ? { id: Number(episodeId) } : {
          ...(showId ? { showId: Number(showId) } : {}),
          ...(season ? { season: Number(season) } : {}),
        }),
      }
    } : {}),
  }

  let clipIdSet: Set<number>

  if (hasTextQuery) {
    const ftsQuery = buildFtsQuery(q.trim())
    const ftsResults = await prisma.$queryRaw<{ rowid: bigint }[]>`
      SELECT rowid FROM quotes_fts WHERE quotes_fts MATCH ${ftsQuery}
    `
    if (ftsResults.length === 0) {
      clipIdSet = new Set()
    } else {
      const quoteIds = ftsResults.map(r => Number(r.rowid))
      const rows = await prisma.quote.findMany({
        where: { id: { in: quoteIds }, ...baseFilter },
        select: { clipId: true },
        distinct: ['clipId'],
      })
      clipIdSet = new Set(rows.map(r => r.clipId))
    }
  } else {
    const rows = await prisma.quote.findMany({
      where: baseFilter,
      select: { clipId: true },
      distinct: ['clipId'],
    })
    clipIdSet = new Set(rows.map(r => r.clipId))
  }

  const totalClips = clipIdSet.size
  if (totalClips === 0) {
    return (
      <div style={{ marginTop: '2rem', textAlign: 'center', padding: '3rem 1rem' }}>
        <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🔍</div>
        <p style={{ color: '#555', fontSize: '0.9375rem', margin: 0 }}>No results for <strong>&ldquo;{q}&rdquo;</strong></p>
        <p style={{ color: '#999', fontSize: '0.8125rem', marginTop: '0.25rem' }}>Try different keywords or check your filters.</p>
      </div>
    )
  }

  const totalPages = Math.ceil(totalClips / limit)
  const clampedPage = Math.min(page, totalPages || 1)
  const clipIds = [...clipIdSet]

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

  // Terms to highlight: words from the query
  const highlightTerms = hasTextQuery
    ? q.trim().toUpperCase().replace(/["*^()]/g, ' ').split(/\s+/).filter(t => t.length > 0)
    : []

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

          const matchingIndices = new Set<number>()
          if (highlightTerms.length > 0) {
            quotes.forEach((qt, i) => {
              if (highlightTerms.some(t => qt.text.toUpperCase().includes(t))) matchingIndices.add(i)
            })
          }

          let visibleQuotes: typeof quotes
          if (matchingIndices.size > 0) {
            const vis = new Set<number>()
            for (const mi of matchingIndices) {
              if (mi > 0) vis.add(mi - 1)
              vis.add(mi)
              if (mi < quotes.length - 1) vis.add(mi + 1)
            }
            visibleQuotes = quotes.filter((_, i) => vis.has(i))
          } else {
            visibleQuotes = quotes.slice(0, 5)
          }

          return (
            <ClickableCard key={clip.id} href={buildClipUrl(clip.id, q, showId, season, episodeId, speakerName)}>
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

              <div>
                {visibleQuotes.map((quote, i) => {
                  const isMatch = matchingIndices.size > 0 &&
                    highlightTerms.some(t => quote.text.toUpperCase().includes(t))
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
                        {isMatch && highlightTerms.length > 0
                          ? highlightText(quote.text, highlightTerms)
                          : quote.text}
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
            <Link href={buildPageUrl(q, clampedPage - 1, limit, showId, season, episodeId, speakerName)}
              style={{ textDecoration: 'none', padding: '0.375rem 0.875rem', background: 'white', border: '1.5px solid #d0d0d0', borderRadius: '6px', fontSize: '0.875rem', color: '#333', fontWeight: 600 }}>
              ← Prev
            </Link>
          ) : (
            <span style={{ padding: '0.375rem 0.875rem', background: '#f5f5f5', border: '1.5px solid #e5e5e5', borderRadius: '6px', fontSize: '0.875rem', color: '#bbb', fontWeight: 600 }}>← Prev</span>
          )}
          <span style={{ fontSize: '0.8125rem', color: '#555', padding: '0 0.5rem' }}>{clampedPage} / {totalPages}</span>
          {clampedPage < totalPages ? (
            <Link href={buildPageUrl(q, clampedPage + 1, limit, showId, season, episodeId, speakerName)}
              style={{ textDecoration: 'none', padding: '0.375rem 0.875rem', background: 'white', border: '1.5px solid #d0d0d0', borderRadius: '6px', fontSize: '0.875rem', color: '#333', fontWeight: 600 }}>
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
