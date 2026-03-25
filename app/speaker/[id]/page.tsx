import { notFound } from 'next/navigation'
import Link from 'next/link'
import prisma from '@/lib/prisma'
import BackButton from '@/app/components/BackButton'
import GamesMenu from '@/app/components/GamesMenu'
import SignOutButton from '@/app/components/SignOutButton'
import { auth } from '@/auth'

interface Props {
  params: Promise<{ id: string }>
}

export default async function SpeakerPage({ params }: Props) {
  const { id } = await params
  const session = await auth()

  const speaker = await prisma.speaker.findUnique({
    where: { id: Number(id) },
    include: { show: true },
  })

  if (!speaker) return notFound()

  const quotes = await prisma.quote.findMany({
    where: { speakerId: speaker.id },
    include: { episode: true },
  })

  if (quotes.length === 0) {
    return (
      <div style={{ background: 'linear-gradient(180deg, #87CEEB 0%, #B0E0FF 100%)', minHeight: '100vh' }}>
        <header style={{ background: '#FED90F', borderBottom: '4px solid #1a1a1a', padding: '0.75rem 1.5rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <BackButton />
          <Link href="/" style={{ fontFamily: 'var(--font-bangers)', fontSize: '1.5rem', color: '#1a1a1a', textDecoration: 'none' }}>SayWhatNow</Link>
          <span style={{ color: '#1a1a1a' }}>›</span>
          <span style={{ fontFamily: 'var(--font-bangers)', fontSize: '1.25rem' }}>{speaker.name}</span>
        </header>
        <div style={{ maxWidth: '720px', margin: '2rem auto', padding: '0 1rem' }}>
          <p style={{ color: '#1B4F72' }}>No quotes found for this speaker.</p>
        </div>
      </div>
    )
  }

  // Stats
  const quoteCount = quotes.length
  const wordCount = quotes.reduce((n, q) => n + q.text.trim().split(/\s+/).filter(Boolean).length, 0)

  const episodeMap = new Map<number, typeof quotes[0]['episode']>()
  for (const q of quotes) episodeMap.set(q.episodeId, q.episode)
  const episodes = [...episodeMap.values()]
  const episodeCount = episodes.length

  const clipIds = new Set(quotes.map(q => q.clipId))
  const clipCount = clipIds.size

  const firstEp = episodes.reduce((a, b) =>
    a.season < b.season || (a.season === b.season && a.episodeNumber < b.episodeNumber) ? a : b
  )

  // Most active season
  const seasonCounts: Record<number, number> = {}
  for (const q of quotes) seasonCounts[q.episode.season] = (seasonCounts[q.episode.season] ?? 0) + 1
  const mostActiveSeason = Number(Object.entries(seasonCounts).sort((a, b) => b[1] - a[1])[0][0])
  const mostActiveSeasonLines = seasonCounts[mostActiveSeason]

  // Most repeated quote
  const textCounts: Record<string, number> = {}
  for (const q of quotes) textCounts[q.text] = (textCounts[q.text] ?? 0) + 1
  const [mostRepeatedText, mostRepeatedCount] = Object.entries(textCounts).sort((a, b) => b[1] - a[1])[0]
  const mostRepeatedQuote = mostRepeatedCount > 1
    ? quotes.find(q => q.text === mostRepeatedText)!
    : null

  // Random quote
  const randomQuote = quotes[Math.floor(Math.random() * quotes.length)]

  // Average words per line
  const avgWords = Math.round(wordCount / quoteCount)

  // Co-speakers
  type CoSpeaker = { id: number; name: string; imageUrl: string | null; sharedClips: number }
  const coSpeakers = await prisma.$queryRaw<CoSpeaker[]>`
    SELECT s.id, s.name, s.imageUrl, COUNT(*) as sharedClips
    FROM ClipSpeaker cs1
    JOIN ClipSpeaker cs2 ON cs1.clipId = cs2.clipId AND cs2.speakerId != cs1.speakerId
    JOIN Speaker s ON s.id = cs2.speakerId
    WHERE cs1.speakerId = ${speaker.id}
    GROUP BY s.id
    ORDER BY sharedClips DESC
    LIMIT 16
  `

  const statCard = (label: string, value: string | number, sub?: string) => (
    <div style={{ background: 'white', border: '2px solid #1a1a1a', borderRadius: '8px', padding: '0.75rem 1rem', boxShadow: '2px 2px 0 #1a1a1a', textAlign: 'center' }}>
      <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#1a1a1a' }}>{value}</div>
      <div style={{ fontSize: '0.75rem', color: '#555', marginTop: '0.1rem' }}>{label}</div>
      {sub && <div style={{ fontSize: '0.7rem', color: '#888', marginTop: '0.1rem' }}>{sub}</div>}
    </div>
  )

  return (
    <div style={{ background: 'linear-gradient(180deg, #87CEEB 0%, #B0E0FF 100%)', minHeight: '100vh' }}>
      <header style={{ background: '#FED90F', borderBottom: '4px solid #1a1a1a', padding: '0.75rem 1.5rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <BackButton />
        <Link href="/" style={{ fontFamily: 'var(--font-bangers)', fontSize: '1.5rem', letterSpacing: '0.05em', color: '#1a1a1a', textDecoration: 'none' }}>SayWhatNow</Link>
        <span style={{ color: '#1a1a1a' }}>›</span>
        <span style={{ fontFamily: 'var(--font-bangers)', fontSize: '1.25rem', letterSpacing: '0.05em' }}>{speaker.name}</span>
        <GamesMenu />
        <span style={{ fontSize: '0.8rem', color: '#5a3e00' }}>{speaker.show.name}</span>
        {(session?.user as { role?: string })?.role === 'ADMIN' && (
          <Link href={`/admin/speakers/${speaker.id}`} style={{ fontSize: '0.8rem', fontWeight: 600, background: '#1a1a1a', color: '#FED90F', padding: '0.25rem 0.6rem', borderRadius: '4px', textDecoration: 'none' }}>Edit</Link>
        )}
        <SignOutButton name={session?.user?.name} image={session?.user?.image} />
      </header>

      <div style={{ maxWidth: '720px', margin: '2rem auto', padding: '0 1rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

        {/* Profile card */}
        <div style={{ background: 'white', border: '2px solid #1a1a1a', borderRadius: '8px', overflow: 'hidden', boxShadow: '3px 3px 0 #1a1a1a', display: 'flex', alignItems: 'center', gap: '1.5rem', padding: '1.25rem' }}>
          <img
            src={speaker.imageUrl ?? '/default-avatar.svg'}
            alt={speaker.name}
            style={{ width: '6rem', height: '6rem', objectFit: 'cover', borderRadius: '50%', border: '3px solid #1a1a1a', flexShrink: 0 }}
          />
          <div>
            <h1 style={{ fontFamily: 'var(--font-bangers)', fontSize: '2rem', letterSpacing: '0.05em', margin: 0, lineHeight: 1 }}>{speaker.name}</h1>
            <p style={{ margin: '0.3rem 0 0', color: '#555', fontSize: '0.875rem' }}>
              {speaker.show.name} &mdash; <span style={{ textTransform: 'capitalize', color: '#888' }}>{speaker.type.toLowerCase().replace('_', ' ')}</span>
            </p>
            <p style={{ margin: '0.2rem 0 0', fontSize: '0.8rem', color: '#888' }}>
              First appearance: S{firstEp.season}E{firstEp.episodeNumber} &ldquo;{firstEp.title}&rdquo;
            </p>
          </div>
        </div>

        {/* Stats grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '0.75rem' }}>
          {statCard('Quotes', quoteCount.toLocaleString())}
          {statCard('Words', wordCount.toLocaleString())}
          {statCard('Episodes', episodeCount)}
          {statCard('Clips', clipCount.toLocaleString())}
          {statCard('Avg words / line', avgWords)}
          {statCard('Most active season', `Season ${mostActiveSeason}`, `${mostActiveSeasonLines.toLocaleString()} lines`)}
        </div>

        {/* Most repeated quote */}
        {mostRepeatedQuote && (
          <Link href={`/clip/${mostRepeatedQuote.clipId}`} style={{ textDecoration: 'none' }}>
            <div style={{ background: 'white', border: '2px solid #1a1a1a', borderRadius: '8px', padding: '1rem', boxShadow: '3px 3px 0 #1a1a1a' }}>
              <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>
                Most Repeated Quote <span style={{ color: '#bbb', fontWeight: 400 }}>({mostRepeatedCount}×)</span>
              </div>
              <p style={{ margin: 0, fontSize: '0.875rem', color: '#1a1a1a', fontStyle: 'italic' }}>&ldquo;{mostRepeatedQuote.text}&rdquo;</p>
              <p style={{ margin: '0.5rem 0 0', fontSize: '0.75rem', color: '#888' }}>
                First in S{mostRepeatedQuote.episode.season}E{mostRepeatedQuote.episode.episodeNumber} &mdash; {mostRepeatedQuote.episode.title}
              </p>
            </div>
          </Link>
        )}

        {/* Random quote */}
        <Link href={`/clip/${randomQuote.clipId}`} style={{ textDecoration: 'none' }}>
          <div style={{ background: '#FFFBCC', border: '2px solid #1a1a1a', borderRadius: '8px', padding: '1rem', boxShadow: '3px 3px 0 #1a1a1a' }}>
            <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>Random Quote</div>
            <p style={{ margin: 0, fontSize: '0.875rem', color: '#1a1a1a', fontStyle: 'italic' }}>&ldquo;{randomQuote.text}&rdquo;</p>
            <p style={{ margin: '0.5rem 0 0', fontSize: '0.75rem', color: '#888' }}>
              S{randomQuote.episode.season}E{randomQuote.episode.episodeNumber} &mdash; {randomQuote.episode.title}
            </p>
          </div>
        </Link>

        {/* Co-speakers */}
        {coSpeakers.length > 0 && (
          <div style={{ background: 'white', border: '2px solid #1a1a1a', borderRadius: '8px', padding: '1rem', boxShadow: '3px 3px 0 #1a1a1a' }}>
            <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.75rem' }}>
              Most Often Appears With
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
              {coSpeakers.map(co => (
                <Link key={co.id} href={`/speaker/${co.id}`} style={{ textDecoration: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.3rem', width: '4.5rem' }} title={`${co.sharedClips} shared clips`}>
                  <img
                    src={co.imageUrl ?? '/default-avatar.svg'}
                    alt={co.name}
                    style={{ width: '3.5rem', height: '3.5rem', objectFit: 'cover', borderRadius: '50%', border: '2px solid #1a1a1a', display: 'block' }}
                  />
                  <span style={{ fontSize: '0.65rem', color: '#444', textAlign: 'center', lineHeight: 1.2, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', width: '100%' }}>
                    {co.name}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Search their quotes */}
        <div style={{ textAlign: 'center' }}>
          <Link
            href={`/?speakerName=${encodeURIComponent(speaker.name)}`}
            style={{ display: 'inline-block', padding: '0.5rem 1.5rem', background: '#FED90F', border: '2px solid #1a1a1a', borderRadius: '6px', fontWeight: 700, textDecoration: 'none', color: '#1a1a1a', boxShadow: '2px 2px 0 #1a1a1a' }}
          >
            Search {speaker.name}&rsquo;s quotes →
          </Link>
        </div>

      </div>
    </div>
  )
}
