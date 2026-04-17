export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import Link from 'next/link'
import prisma from '@/lib/prisma'
import SiteHeader from '@/app/components/SiteHeader'
import { auth } from '@/auth'
import { toTitleCase } from '@/lib/display'
import nextDynamic from 'next/dynamic'
const SpeakerDonut = nextDynamic(() => import('@/app/components/SpeakerDonut'))

interface Props {
  params: Promise<{ id: string }>
}

export default async function ShowPage({ params }: Props) {
  const { id } = await params
  const showId = Number(id)
  const session = await auth()

  const show = await prisma.show.findUnique({ where: { id: showId } })
  if (!show) return notFound()

  const [episodeCount, clipCount, quoteCount, speakerCount, runtimeAgg] = await Promise.all([
    prisma.episode.count({ where: { showId } }),
    prisma.clip.count({ where: { episode: { showId } } }),
    prisma.quote.count({ where: { episode: { showId } } }),
    prisma.speaker.count({ where: { showId, quotes: { some: {} } } }),
    prisma.clip.aggregate({ _sum: { duration: true }, where: { episode: { showId } } }),
  ])

  const totalSeconds = runtimeAgg._sum.duration ?? 0
  const runtimeHours = Math.floor(totalSeconds / 3600)
  const runtimeMins = Math.floor((totalSeconds % 3600) / 60)

  // Season breakdown
  const episodes = await prisma.episode.findMany({
    where: { showId },
    include: { _count: { select: { clips: true, quotes: true } } },
    orderBy: [{ season: 'asc' }, { episodeNumber: 'asc' }],
  })

  type SeasonRow = { season: number; episodeCount: number; clipCount: number; quoteCount: number }
  const seasonMap = new Map<number, SeasonRow>()
  for (const ep of episodes) {
    const row = seasonMap.get(ep.season) ?? { season: ep.season, episodeCount: 0, clipCount: 0, quoteCount: 0 }
    row.episodeCount++
    row.clipCount += ep._count.clips
    row.quoteCount += ep._count.quotes
    seasonMap.set(ep.season, row)
  }
  const seasons = [...seasonMap.values()]

  // Most quoted episode
  const mostQuotedEp = episodes.reduce((a, b) => a._count.quotes > b._count.quotes ? a : b)

  // Top speakers by word count
  const topSpeakers = await prisma.$queryRaw<Array<{ id: number; name: string; imageUrl: string | null; imagePosition: string | null; wordCount: bigint; quoteCount: bigint }>>`
    SELECT s.id, s.name, s.imageUrl, s.imagePosition,
      COUNT(q.id) as quoteCount,
      SUM(length(trim(q.text)) - length(replace(trim(q.text), ' ', '')) + 1) as wordCount
    FROM Speaker s
    JOIN Quote q ON q.speakerId = s.id
    JOIN Episode e ON q.episodeId = e.id
    WHERE e.showId = ${showId}
    GROUP BY s.id
    ORDER BY wordCount DESC
    LIMIT 16
  `
  const totalSpeakerWords = topSpeakers.reduce((n, sp) => n + Number(sp.wordCount), 0)

  const statCard = (label: string, value: string | number, sub?: string) => (
    <div style={{ background: 'white', border: '2px solid #1a1a1a', borderRadius: '8px', padding: '0.75rem 1rem', boxShadow: '2px 2px 0 #1a1a1a', textAlign: 'center' }}>
      <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#1a1a1a' }}>{value}</div>
      <div style={{ fontSize: '0.75rem', color: '#555', marginTop: '0.1rem' }}>{label}</div>
      {sub && <div style={{ fontSize: '0.7rem', color: '#888', marginTop: '0.1rem' }}>{sub}</div>}
    </div>
  )

  return (
    <div style={{ background: 'linear-gradient(180deg, #87CEEB 0%, #B0E0FF 100%)', minHeight: '100vh' }}>
      <SiteHeader
        userName={session?.user?.name}
        userImage={session?.user?.image}
        isAdmin={(session?.user as { role?: string })?.role === 'ADMIN'}
        back
        subtitle={<span style={{ fontFamily: 'var(--font-bangers)', fontSize: '1.1rem', letterSpacing: '0.03em' }}>{toTitleCase(show.name)}</span>}
      />

      <div style={{ maxWidth: '800px', margin: '2rem auto', padding: '0 1rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

        {/* Title */}
        <h1 style={{ fontFamily: 'var(--font-bangers)', fontSize: '2.5rem', letterSpacing: '0.05em', margin: 0, lineHeight: 1 }}>
          {show.name}
        </h1>

        {/* Stats grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '0.75rem' }}>
          {statCard('Seasons', seasons.length)}
          {statCard('Episodes', episodeCount.toLocaleString())}
          {statCard('Clips', clipCount.toLocaleString())}
          {statCard('Quotes', quoteCount.toLocaleString())}
          {statCard('Speakers', speakerCount.toLocaleString())}
          {statCard('Runtime', `${runtimeHours}h ${runtimeMins}m`)}
        </div>

        {/* Season breakdown */}
        <div style={{ background: 'white', border: '2px solid #1a1a1a', borderRadius: '8px', overflow: 'hidden', boxShadow: '3px 3px 0 #1a1a1a' }}>
          <div style={{ padding: '0.75rem 1rem', borderBottom: '2px solid #1a1a1a', fontSize: '0.7rem', fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Season Breakdown
          </div>
          <table className="stats-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #e5e5e5', background: '#fafafa' }}>
                <th style={{ textAlign: 'left', fontWeight: 600, color: '#555' }}>Season</th>
                <th style={{ textAlign: 'right', fontWeight: 600, color: '#555' }}>Episodes</th>
                <th style={{ textAlign: 'right', fontWeight: 600, color: '#555' }}>Clips</th>
                <th style={{ textAlign: 'right', fontWeight: 600, color: '#555' }}>Quotes</th>
              </tr>
            </thead>
            <tbody>
              {seasons.map((row, i) => (
                <tr key={row.season} style={{ borderBottom: i < seasons.length - 1 ? '1px solid #f0f0f0' : 'none' }}>
                  <td style={{ fontWeight: 600 }}>
                    <Link href={`/show/${showId}?season=${row.season}`} style={{ textDecoration: 'none', color: '#1a1a1a' }}>
                      Season {row.season}
                    </Link>
                  </td>
                  <td style={{ textAlign: 'right', color: '#555' }}>{row.episodeCount}</td>
                  <td style={{ textAlign: 'right', color: '#555' }}>{row.clipCount.toLocaleString()}</td>
                  <td style={{ textAlign: 'right', color: '#555' }}>{row.quoteCount.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Most quoted episode */}
        <Link href={`/episode/${mostQuotedEp.id}`} style={{ textDecoration: 'none' }}>
          <div style={{ background: '#FFFBCC', border: '2px solid #1a1a1a', borderRadius: '8px', padding: '1rem', boxShadow: '3px 3px 0 #1a1a1a' }}>
            <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.4rem' }}>Most Quoted Episode</div>
            <div style={{ fontWeight: 700, fontSize: '1rem' }}>
              S{mostQuotedEp.season}E{String(mostQuotedEp.episodeNumber).padStart(2, '0')} — {toTitleCase(mostQuotedEp.title)}
            </div>
            <div style={{ fontSize: '0.8rem', color: '#888', marginTop: '0.2rem' }}>{mostQuotedEp._count.quotes.toLocaleString()} quotes · {mostQuotedEp._count.clips} clips</div>
          </div>
        </Link>

        {/* Top speakers */}
        <div style={{ background: 'white', border: '2px solid #1a1a1a', borderRadius: '8px', padding: '1rem', boxShadow: '3px 3px 0 #1a1a1a' }}>
          <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.75rem' }}>
            Top Speakers
          </div>
          <SpeakerDonut speakers={topSpeakers.map(sp => ({ id: sp.id, name: sp.name, words: Number(sp.wordCount), quotes: Number(sp.quoteCount) }))} totalWords={totalSpeakerWords} />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
            {topSpeakers.map(sp => (
              <Link key={sp.id} href={`/speaker/${sp.id}`} style={{ textDecoration: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.3rem', width: '4.5rem' }}>
                <img
                  src={sp.imageUrl ?? '/default-avatar.svg'}
                  alt={sp.name}
                  style={{ width: '3.5rem', height: '3.5rem', objectFit: 'cover', objectPosition: sp.imagePosition ?? 'center center', borderRadius: '50%', border: '2px solid #1a1a1a', display: 'block' }}
                />
                <span style={{ fontSize: '0.65rem', color: '#444', textAlign: 'center', lineHeight: 1.2, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', width: '100%' }}>
                  {toTitleCase(sp.name)}
                </span>
                <span style={{ fontSize: '0.6rem', color: '#aaa', textAlign: 'center' }}>{Number(sp.wordCount).toLocaleString()} words</span>
              </Link>
            ))}
          </div>
        </div>

        {/* Episode list */}
        <div style={{ background: 'white', border: '2px solid #1a1a1a', borderRadius: '8px', overflow: 'hidden', boxShadow: '3px 3px 0 #1a1a1a' }}>
          <div style={{ padding: '0.75rem 1rem', borderBottom: '2px solid #1a1a1a', fontSize: '0.7rem', fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            All Episodes
          </div>
          {seasons.map(row => (
            <div key={row.season}>
              <div style={{ padding: '0.5rem 1rem', background: '#f5f5f5', borderBottom: '1px solid #e5e5e5', fontSize: '0.75rem', fontWeight: 700, color: '#555', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Season {row.season}
              </div>
              {episodes
                .filter(ep => ep.season === row.season)
                .map((ep, i, arr) => (
                  <Link
                    key={ep.id}
                    href={`/episode/${ep.id}`}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '0.5rem 1rem', textDecoration: 'none', color: '#1a1a1a',
                      borderBottom: i < arr.length - 1 ? '1px solid #f0f0f0' : 'none',
                      fontSize: '0.875rem',
                    }}
                  >
                    <span>
                      <span style={{ color: '#888', marginRight: '0.5rem', fontSize: '0.75rem', fontWeight: 600 }}>
                        E{String(ep.episodeNumber).padStart(2, '0')}
                      </span>
                      {toTitleCase(ep.title)}
                    </span>
                    <span className="episode-row-meta">
                      {ep._count.clips} clips · {ep._count.quotes} quotes
                    </span>
                  </Link>
                ))}
            </div>
          ))}
        </div>

      </div>
    </div>
  )
}
