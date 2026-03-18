import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

type Row = {
  id: number
  text: string
  clipId: number
  speakerId: number
  speakerName: string
  speakerImageUrl: string
  season: number
  episodeNumber: number
  episodeTitle: string
}

export async function GET() {
  const rows = await prisma.$queryRaw<Row[]>`
    SELECT q.id, q.text, q.clipId, q.speakerId,
           s.name as speakerName, s.imageUrl as speakerImageUrl,
           e.season, e.episodeNumber, e.title as episodeTitle
    FROM Quote q
    JOIN Speaker s ON s.id = q.speakerId
    JOIN Episode e ON e.id = q.episodeId
    WHERE s.imageUrl IS NOT NULL
      AND length(q.text) >= 10
      AND length(q.text) <= 45
    ORDER BY RANDOM()
    LIMIT 1
  `

  if (!rows.length) return NextResponse.json({ error: 'No quotes found' }, { status: 404 })

  const r = rows[0]
  return NextResponse.json({
    id: r.id,
    text: r.text,
    clipId: r.clipId,
    speaker: { id: r.speakerId, name: r.speakerName, imageUrl: r.speakerImageUrl },
    episode: { season: r.season, episodeNumber: r.episodeNumber, title: r.episodeTitle },
  })
}
