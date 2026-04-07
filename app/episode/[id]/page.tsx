export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import Link from 'next/link'
import prisma from '@/lib/prisma'
import SiteHeader from '@/app/components/SiteHeader'
import { auth } from '@/auth'
import { toTitleCase } from '@/lib/display'
import SpeakerDonut from '@/app/components/SpeakerDonut'

interface Props {
  params: Promise<{ id: string }>
}

export default async function EpisodePage({ params }: Props) {
  const { id } = await params
  const episodeId = Number(id)
  const session = await auth()

  const episode = await prisma.episode.findUnique({
    where: { id: episodeId },
    include: { show: true },
  })
  if (!episode) return notFound()

  const clips = await prisma.clip.findMany({
    where: { episodeId },
    include: {
      quotes: {
        include: { speaker: { select: { id: true, name: true, imageUrl: true, imagePosition: true } } },
        orderBy: { sequence: 'asc' },
      },
    },
    orderBy: { id: 'asc' },
  })

  const quoteCount = clips.reduce((n, c) => n + c.quotes.length, 0)
  const totalWords = clips.flatMap(c => c.quotes).reduce((n, q) => n + q.text.trim().split(/\s+/).filter(Boolean).length, 0)
  const totalDuration = clips.reduce((n, c) => n + (c.duration ?? 0), 0)
  const avgClipDuration = clips.length ? Math.round(totalDuration / clips.length) : 0

  // Speaker breakdown
  const speakerStats = new Map<number, { name: string; imageUrl: string | null; imagePosition: string | null; quotes: number; words: number }>()
  for (const clip of clips) {
    for (const q of clip.quotes) {
      if (!q.speakerId || !q.speaker) continue
      const entry = speakerStats.get(q.speakerId) ?? { name: q.speaker.name, imageUrl: q.speaker.imageUrl, imagePosition: q.speaker.imagePosition, quotes: 0, words: 0 }
      entry.quotes++
      entry.words += q.text.trim().split(/\s+/).filter(Boolean).length
      speakerStats.set(q.speakerId, entry)
    }
  }
  const speakerList = [...speakerStats.entries()]
    .map(([id, v]) => ({ id, ...v }))
    .sort((a, b) => b.words - a.words)
  const speakerCount = speakerList.length
  const totalSpeakerWords = speakerList.reduce((n, sp) => n + sp.words, 0)

  // Random quote
  const allQuotes = clips.flatMap(c => c.quotes.map(q => ({ ...q, clipId: c.id })))
  const randomQuote = allQuotes.length ? allQuotes[Math.floor(Math.random() * allQuotes.length)] : null

  const statCard = (label: string, value: string | number, sub?: string) => (
    <div style={{ background: 'white', border: '2px solid #1a1a1a', borderRadius: '8px', padding: '0.75rem 1rem', boxShadow: '2px 2px 0 #1a1a1a', textAlign: 'center' }}>
      <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#1a1a1a' }}>{value}</div>
      <div style={{ fontSize: '0.75rem', color: '#555', marginTop: '0.1rem' }}>{label}</div>
      {sub && <div style={{ fontSize: '0.7rem', color: '#888', marginTop: '0.1rem' }}>{sub}</div>}
    </div>
  )

  const airDateStr = episode.airDate
    ? new Date(episode.airDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : null

  return (
    <div style={{ background: 'linear-gradient(180deg, #87CEEB 0%, #B0E0FF 100%)', minHeight: '100vh' }}>
      <SiteHeader
        userName={session?.user?.name}
        userImage={session?.user?.image}
        isAdmin={(session?.user as { role?: string })?.role === 'ADMIN'}
        back
        subtitle={
          <>
            <Link href={`/show/${episode.show.id}`} style={{ color: '#3a2800', textDecoration: 'none' }}>{episode.show.name}</Link>
            {' › '}S{episode.season}E{String(episode.episodeNumber).padStart(2, '0')} — {toTitleCase(episode.title)}
          </>
        }
      />

      <div style={{ maxWidth: '800px', margin: '2rem auto', padding: '0 1rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

        {/* Title card */}
        <div style={{ background: 'white', border: '2px solid #1a1a1a', borderRadius: '8px', padding: '1.25rem', boxShadow: '3px 3px 0 #1a1a1a' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#888', marginBottom: '0.3rem' }}>
            {episode.show.name} · Season {episode.season}, Episode {episode.episodeNumber}
            {episode.productionCode && <span style={{ marginLeft: '0.5rem', color: '#bbb' }}>({episode.productionCode})</span>}
          </div>
          <h1 style={{ fontFamily: 'var(--font-bangers)', fontSize: '2rem', letterSpacing: '0.05em', margin: 0, lineHeight: 1.1 }}>
            {toTitleCase(episode.title)}
          </h1>
          {airDateStr && (
            <div style={{ fontSize: '0.8rem', color: '#888', marginTop: '0.4rem' }}>Aired {airDateStr}</div>
          )}
        </div>

        {/* Stats grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '0.75rem' }}>
          {statCard('Clips', clips.length)}
          {statCard('Quotes', quoteCount.toLocaleString())}
          {statCard('Speakers', speakerCount)}
          {statCard('Words', totalWords.toLocaleString())}
          {statCard('Avg clip length', `${avgClipDuration}s`)}
        </div>

        {/* Speaker breakdown */}
        {speakerList.length > 0 && (
          <div style={{ background: 'white', border: '2px solid #1a1a1a', borderRadius: '8px', padding: '1rem', boxShadow: '3px 3px 0 #1a1a1a' }}>
            <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.75rem' }}>
              Speaker Breakdown
            </div>
            <SpeakerDonut speakers={speakerList.map(sp => ({ id: sp.id, name: sp.name, words: sp.words, quotes: sp.quotes }))} totalWords={totalSpeakerWords} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {speakerList.map(sp => {
                const pct = totalSpeakerWords ? Math.round((sp.words / totalSpeakerWords) * 100) : 0
                return (
                  <div key={sp.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <a href={`/speaker/${sp.id}`} style={{ flexShrink: 0, display: 'block' }}>
                      <img
                        src={sp.imageUrl ?? '/default-avatar.svg'}
                        alt={sp.name}
                        style={{ width: '2rem', height: '2rem', objectFit: 'cover', objectPosition: sp.imagePosition ?? 'center center', borderRadius: '50%', border: '2px solid #1a1a1a', display: 'block' }}
                      />
                    </a>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.2rem', fontSize: '0.8rem' }}>
                        <span style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{toTitleCase(sp.name)}</span>
                        <span style={{ color: '#888', flexShrink: 0, marginLeft: '0.5rem' }}>{pct}% ({sp.quotes} lines)</span>
                      </div>
                      <div style={{ background: '#f0f0f0', borderRadius: '3px', height: '6px', overflow: 'hidden' }}>
                        <div style={{ background: '#FED90F', height: '100%', width: `${pct}%`, borderRadius: '3px' }} />
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Random quote */}
        {randomQuote && (
          <Link href={`/clip/${randomQuote.clipId}`} style={{ textDecoration: 'none' }}>
            <div style={{ background: '#FFFBCC', border: '2px solid #1a1a1a', borderRadius: '8px', padding: '1rem', boxShadow: '3px 3px 0 #1a1a1a' }}>
              <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>Random Quote</div>
              {randomQuote.speaker && (
                <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#555', marginBottom: '0.25rem' }}>{toTitleCase(randomQuote.speaker.name)}</div>
              )}
              <p style={{ margin: 0, fontSize: '0.8125rem', color: '#444', letterSpacing: '0.015em' }}>&ldquo;{randomQuote.text}&rdquo;</p>
            </div>
          </Link>
        )}

        {/* Clip list */}
        <div style={{ background: 'white', border: '2px solid #1a1a1a', borderRadius: '8px', overflow: 'hidden', boxShadow: '3px 3px 0 #1a1a1a' }}>
          <div style={{ padding: '0.75rem 1rem', borderBottom: '2px solid #1a1a1a', fontSize: '0.7rem', fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Clips ({clips.length})
          </div>
          {clips.map((clip, i) => {
            const firstLine = clip.quotes[0]
            const speakersInClip = [...new Map(clip.quotes.filter(q => q.speaker).map(q => [q.speakerId, q.speaker!])).values()]
            return (
              <Link
                key={clip.id}
                href={`/clip/${clip.id}`}
                style={{
                  display: 'block', padding: '0.65rem 1rem', textDecoration: 'none', color: '#1a1a1a',
                  borderBottom: i < clips.length - 1 ? '1px solid #f0f0f0' : 'none',
                  fontSize: '0.875rem',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
                  <div style={{ minWidth: 0 }}>
                    <span style={{ fontSize: '0.7rem', fontWeight: 600, color: '#aaa', marginRight: '0.5rem' }}>#{i + 1}</span>
                    {firstLine && (
                      <span style={{ color: '#444' }}>
                        {firstLine.speaker && <span style={{ fontWeight: 600 }}>{toTitleCase(firstLine.speaker.name)}: </span>}
                        <span style={{ color: '#666' }}>&ldquo;{firstLine.text.length > 80 ? firstLine.text.slice(0, 80) + '…' : firstLine.text}&rdquo;</span>
                      </span>
                    )}
                    {speakersInClip.length > 0 && (
                      <div style={{ display: 'flex', gap: '0.25rem', marginTop: '0.3rem', flexWrap: 'wrap' }}>
                        {speakersInClip.slice(0, 4).map(sp => (
                          <span key={sp.id} style={{ fontSize: '0.65rem', background: '#f5f5f5', border: '1px solid #e0e0e0', borderRadius: '3px', padding: '0 0.3rem', color: '#666' }}>
                            {toTitleCase(sp.name)}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="clip-row-meta">
                    {clip.quotes.length} lines
                    <div style={{ color: '#bbb' }}>{clip.duration}s</div>
                  </div>
                </div>
              </Link>
            )
          })}
        </div>

        {/* Search link */}
        <div style={{ textAlign: 'center' }}>
          <Link
            href={`/?episodeId=${episode.id}`}
            style={{ display: 'inline-block', padding: '0.5rem 1.5rem', background: '#FED90F', border: '2px solid #1a1a1a', borderRadius: '6px', fontWeight: 700, textDecoration: 'none', color: '#1a1a1a', boxShadow: '2px 2px 0 #1a1a1a' }}
          >
            Browse all clips from this episode →
          </Link>
        </div>

      </div>
    </div>
  )
}
