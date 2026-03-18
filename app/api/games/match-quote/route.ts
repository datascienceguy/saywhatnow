import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

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

export async function GET() {
  // Pick a random quote with 5+ words and a speaker with an image
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

  if (!quotes.length) return NextResponse.json({ error: 'No quotes found' }, { status: 404 })
  const q = quotes[0]

  // Get co-speakers (appear in same clips) as primary decoys
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

  let decoys = coSpeakers.filter(s => s.id !== q.speakerId)

  // Supplement with same-type speakers from same show if needed
  if (decoys.length < 7) {
    const needed = 7 - decoys.length
    const existingIds = [q.speakerId, ...decoys.map(s => s.id)]
    const extras = await prisma.speaker.findMany({
      where: {
        showId: q.showId,
        imageUrl: { not: null },
        id: { notIn: existingIds },
      },
      select: { id: true, name: true, imageUrl: true },
      orderBy: { id: 'asc' },
      take: needed * 3,
    })
    const shuffledExtras = shuffle(extras as SpeakerRow[]).slice(0, needed)
    decoys = [...decoys, ...shuffledExtras]
  }

  const correctSpeaker = { id: q.speakerId, name: q.speakerName, imageUrl: q.speakerImageUrl }
  const choices = shuffle([correctSpeaker, ...decoys.slice(0, 7)])

  return NextResponse.json({
    id: q.id,
    text: q.text,
    clipId: q.clipId,
    correctSpeakerId: q.speakerId,
    episode: { season: q.season, episodeNumber: q.episodeNumber, title: q.episodeTitle },
    choices,
  })
}
