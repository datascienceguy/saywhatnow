import { notFound } from 'next/navigation'
import prisma from '@/lib/prisma'
import SiteHeader from '@/app/components/SiteHeader'
import { auth } from '@/auth'
import HangmanGame from './HangmanGame'

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

export default async function HangmanPage() {
  const session = await auth()
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

  if (!rows.length) return notFound()

  const r = rows[0]
  const initialQuote = {
    id: r.id,
    text: r.text,
    clipId: r.clipId,
    speaker: { id: r.speakerId, name: r.speakerName, imageUrl: r.speakerImageUrl },
    episode: { season: r.season, episodeNumber: r.episodeNumber, title: r.episodeTitle },
  }

  return (
    <div style={{ background: 'linear-gradient(180deg, #87CEEB 0%, #B0E0FF 100%)', minHeight: '100vh' }}>
      <SiteHeader
        userName={session?.user?.name}
        userImage={session?.user?.image}
        back
        subtitle="Games · Hangman"
      />
      <HangmanGame initialQuote={initialQuote} />
    </div>
  )
}
