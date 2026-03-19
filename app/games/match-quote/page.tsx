import { notFound } from 'next/navigation'
import Link from 'next/link'
import prisma from '@/lib/prisma'
import BackButton from '@/app/components/BackButton'
import GamesMenu from '@/app/components/GamesMenu'
import SignOutButton from '@/app/components/SignOutButton'
import { auth } from '@/auth'
import MatchQuoteGame from './MatchQuoteGame'

type QuoteRow = {
  id: number
  text: string
  clipId: number
  speakerId: number
  speakerName: string
  speakerImageUrl: string
  speakerType: string
  showId: number
  season: number
  episodeNumber: number
  episodeTitle: string
}

type SpeakerRow = {
  id: number
  name: string
  imageUrl: string
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export default async function MatchQuotePage() {
  const session = await auth()
  const quotes = await prisma.$queryRaw<QuoteRow[]>`
    SELECT q.id, q.text, q.clipId, q.speakerId,
           s.name as speakerName, s.imageUrl as speakerImageUrl, s.type as speakerType,
           e.showId, e.season, e.episodeNumber, e.title as episodeTitle
    FROM Quote q
    JOIN Speaker s ON s.id = q.speakerId
    JOIN Episode e ON e.id = q.episodeId
    WHERE s.imageUrl IS NOT NULL
      AND (length(q.text) - length(replace(q.text, ' ', ''))) >= 4
    ORDER BY RANDOM()
    LIMIT 1
  `

  if (!quotes.length) return notFound()
  const q = quotes[0]

  const coSpeakers = await prisma.$queryRaw<SpeakerRow[]>`
    SELECT DISTINCT s.id, s.name, s.imageUrl
    FROM ClipSpeaker cs1
    JOIN ClipSpeaker cs2 ON cs1.clipId = cs2.clipId AND cs2.speakerId != cs1.speakerId
    JOIN Speaker s ON s.id = cs2.speakerId
    WHERE cs1.speakerId = ${q.speakerId}
      AND s.imageUrl IS NOT NULL
    ORDER BY RANDOM()
    LIMIT 9
  `

  let decoys: SpeakerRow[] = coSpeakers.filter(s => s.id !== q.speakerId)

  if (decoys.length < 7) {
    const needed = 7 - decoys.length
    const existingIds = [q.speakerId, ...decoys.map(s => s.id)]
    const extras = await prisma.speaker.findMany({
      where: { showId: q.showId, imageUrl: { not: null }, id: { notIn: existingIds } },
      select: { id: true, name: true, imageUrl: true },
      take: needed * 3,
    })
    decoys = [...decoys, ...shuffle(extras as SpeakerRow[]).slice(0, needed)]
  }

  const correctSpeaker = { id: q.speakerId, name: q.speakerName, imageUrl: q.speakerImageUrl }
  const choices = shuffle([correctSpeaker, ...decoys.slice(0, 7)])

  const initialQuote = {
    id: q.id,
    text: q.text,
    clipId: q.clipId,
    correctSpeakerId: q.speakerId,
    episode: { season: q.season, episodeNumber: q.episodeNumber, title: q.episodeTitle },
    choices,
  }

  return (
    <div style={{ background: 'linear-gradient(180deg, #87CEEB 0%, #B0E0FF 100%)', minHeight: '100vh' }}>
      <header style={{ background: '#FED90F', borderBottom: '4px solid #1a1a1a', padding: '0.75rem 1.5rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <BackButton />
        <Link href="/" style={{ fontFamily: 'var(--font-bangers)', fontSize: '1.5rem', letterSpacing: '0.05em', color: '#1a1a1a', textDecoration: 'none' }}>SayWhatNow</Link>
        <span style={{ color: '#1a1a1a' }}>›</span>
        <GamesMenu />
        <span style={{ color: '#1a1a1a' }}>›</span>
        <span style={{ fontFamily: 'var(--font-bangers)', fontSize: '1.25rem', letterSpacing: '0.05em' }}>Match the Quote</span>
        <SignOutButton name={session?.user?.name} image={session?.user?.image} />
      </header>
      <MatchQuoteGame initialQuote={initialQuote} />
    </div>
  )
}
