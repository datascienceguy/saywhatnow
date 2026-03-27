export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import prisma from '@/lib/prisma'
import SiteHeader from '@/app/components/SiteHeader'
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
      <SiteHeader
        userName={session?.user?.name}
        userImage={session?.user?.image}
        back
        subtitle="Games · Match the Quote"
      />
      <MatchQuoteGame initialQuote={initialQuote} />
    </div>
  )
}
