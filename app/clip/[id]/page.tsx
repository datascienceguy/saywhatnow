import { notFound } from 'next/navigation'
import Link from 'next/link'
import prisma from '@/lib/prisma'
import ClipViewer from '@/app/components/ClipViewer'
import SpeakerLink from '@/app/components/SpeakerLink'
import BackButton from '@/app/components/BackButton'
import GamesMenu from '@/app/components/GamesMenu'

interface Props {
  params: Promise<{ id: string }>
  searchParams: Promise<{ q?: string; showId?: string; season?: string; episodeId?: string; speakerName?: string }>
}

export default async function ClipPage({ params, searchParams }: Props) {
  const { id } = await params
  const { q } = await searchParams

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

  return (
    <div style={{ background: 'linear-gradient(180deg, #87CEEB 0%, #B0E0FF 100%)', minHeight: '100vh' }}>
      <header style={{ background: '#FED90F', borderBottom: '4px solid #1a1a1a', padding: '0.75rem 1.5rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <BackButton />
        <Link href="/" style={{ fontFamily: 'var(--font-bangers)', fontSize: '1.5rem', letterSpacing: '0.05em', color: '#1a1a1a', textDecoration: 'none' }}>SayWhatNow</Link>
        <span style={{ color: '#1a1a1a' }}>›</span>
        <span style={{ fontFamily: 'var(--font-bangers)', fontSize: '1.25rem', letterSpacing: '0.05em' }}>
          {ep.show.name} &mdash; S{ep.season}E{ep.episodeNumber} &ldquo;{ep.title}&rdquo;
        </span>
        <GamesMenu />
        <span style={{ fontSize: '0.75rem', color: '#5a3e00', marginLeft: 'auto' }}>
          {clip.startTime} &ndash; {clip.stopTime}
        </span>
      </header>

      <div style={{ maxWidth: '1100px', margin: '2rem auto', padding: '0 1rem' }}>
        {clip.filePath.endsWith('.mp4') ? (
          <ClipViewer
            src={clip.filePath}
            startTime={clip.startTime}
            stopTime={clip.stopTime}
            quotes={clip.quotes.map(qt => ({
              id: qt.id,
              text: qt.text,
              sequence: qt.sequence,
              speaker: qt.speaker ? { id: qt.speaker.id, name: qt.speaker.name, imageUrl: qt.speaker.imageUrl } : null,
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
                    <SpeakerLink
                      id={quote.speaker?.id ?? null}
                      name={quote.speaker?.name ?? null}
                      imageUrl={quote.speaker?.imageUrl ?? null}
                      isMatch={!!isMatch}
                    />
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
