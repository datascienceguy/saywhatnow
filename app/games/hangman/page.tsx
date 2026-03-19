import { notFound } from 'next/navigation'
import Link from 'next/link'
import prisma from '@/lib/prisma'
import BackButton from '@/app/components/BackButton'
import GamesMenu from '@/app/components/GamesMenu'
import SignOutButton from '@/app/components/SignOutButton'
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
      <header style={{ background: '#FED90F', borderBottom: '4px solid #1a1a1a', padding: '0.75rem 1.5rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <BackButton />
        <Link href="/" style={{ fontFamily: 'var(--font-bangers)', fontSize: '1.5rem', letterSpacing: '0.05em', color: '#1a1a1a', textDecoration: 'none' }}>SayWhatNow</Link>
        <span style={{ color: '#1a1a1a' }}>›</span>
        <GamesMenu />
        <span style={{ color: '#1a1a1a' }}>›</span>
        <span style={{ fontFamily: 'var(--font-bangers)', fontSize: '1.25rem', letterSpacing: '0.05em' }}>Hangman</span>
        <SignOutButton name={session?.user?.name} image={session?.user?.image} />
      </header>
      <HangmanGame initialQuote={initialQuote} />
    </div>
  )
}
