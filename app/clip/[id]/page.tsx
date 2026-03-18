import { notFound } from 'next/navigation'
import Link from 'next/link'
import prisma from '@/lib/prisma'
import ClipViewer from '@/app/components/ClipViewer'

interface Props {
  params: Promise<{ id: string }>
  searchParams: Promise<{ q?: string; showId?: string; season?: string; episodeId?: string; speakerName?: string }>
}

export default async function ClipPage({ params, searchParams }: Props) {
  const { id } = await params
  const { q, showId, season, episodeId, speakerName } = await searchParams

  const clip = await prisma.clip.findUnique({
    where: { id: Number(id) },
    include: {
      episode: { include: { show: true } },
      quotes: {
        include: { speaker: true },
        orderBy: { sequence: 'asc' },
      },
    },
  })

  if (!clip) return notFound()

  const ep = clip.episode

  const backParams = new URLSearchParams()
  if (q) backParams.set('q', q)
  if (showId) backParams.set('showId', showId)
  if (season) backParams.set('season', season)
  if (episodeId) backParams.set('episodeId', episodeId)
  if (speakerName) backParams.set('speakerName', speakerName)
  const backUrl = `/?${backParams.toString()}`

  return (
    <div style={{ background: 'linear-gradient(180deg, #87CEEB 0%, #B0E0FF 100%)', minHeight: '100vh' }}>
      <header style={{ background: '#FED90F', borderBottom: '4px solid #1a1a1a', padding: '0.75rem 1.5rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <Link href={backUrl} style={{ fontWeight: 700, fontSize: '0.875rem', color: '#1a1a1a', textDecoration: 'none', border: '2px solid #1a1a1a', padding: '0.2rem 0.6rem', borderRadius: '4px', boxShadow: '2px 2px 0 #1a1a1a', background: 'white' }}>
          ← Back
        </Link>
        <span style={{ fontFamily: 'var(--font-bangers)', fontSize: '1.5rem', letterSpacing: '0.05em' }}>
          {ep.show.name} &mdash; S{ep.season}E{ep.episodeNumber} &ldquo;{ep.title}&rdquo;
        </span>
        <span style={{ fontSize: '0.75rem', color: '#5a3e00', marginLeft: 'auto' }}>
          {clip.startTime} &ndash; {clip.stopTime}
        </span>
      </header>

      <div style={{ maxWidth: '720px', margin: '2rem auto', padding: '0 1rem' }}>
        {clip.filePath.endsWith('.mp4') ? (
          <ClipViewer
            src={clip.filePath}
            startTime={clip.startTime}
            stopTime={clip.stopTime}
            quotes={clip.quotes.map(qt => ({
              id: qt.id,
              text: qt.text,
              sequence: qt.sequence,
              speaker: qt.speaker ? { name: qt.speaker.name, imageUrl: qt.speaker.imageUrl } : null,
            }))}
            matchQ={q}
          />
        ) : (
          <>
            <div style={{ border: '2px solid #1a1a1a', borderRadius: '8px', padding: '1rem', background: 'white', marginBottom: '1rem', fontSize: '0.875rem', color: '#888' }}>
              Video not yet converted
            </div>
            <div style={{ border: '2px solid #1a1a1a', borderRadius: '8px', overflow: 'hidden', boxShadow: '3px 3px 0 #1a1a1a', background: 'white' }}>
              {clip.quotes.map((quote, i) => {
                const isMatch = q && quote.text.toLowerCase().includes(q.toLowerCase())
                return (
                  <div key={quote.id} style={{ padding: '0.4rem 1rem', display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '0.875rem', background: isMatch ? '#FFFBCC' : i % 2 === 0 ? '#fff' : '#fafafa', borderTop: i > 0 ? '1px solid #e5e5e5' : undefined }}>
                    {quote.speaker?.imageUrl ? (
                      <img src={quote.speaker.imageUrl} alt={quote.speaker.name} style={{ width: '2.5rem', height: '2.5rem', objectFit: 'cover', borderRadius: '50%', border: '2px solid #1a1a1a', flexShrink: 0 }} />
                    ) : (
                      <img src="/default-avatar.svg" alt="Unknown speaker" style={{ width: '2.5rem', height: '2.5rem', objectFit: 'cover', borderRadius: '50%', border: '2px solid #ccc', flexShrink: 0 }} />
                    )}
                    <span style={{ color: '#888', flexShrink: 0, width: '9rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.75rem' }}>
                      {quote.speaker?.name ?? 'UNKNOWN'}
                    </span>
                    <span style={{ fontWeight: isMatch ? 600 : 400, color: isMatch ? '#1a1a1a' : '#444' }}>
                      {quote.text}
                    </span>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
