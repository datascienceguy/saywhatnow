import prisma from '@/lib/prisma'

interface Props {
  q: string
  showId?: string
  season?: string
}

export default async function SearchResults({ q, showId, season }: Props) {
  if (q.length < 2) return <p className="mt-8 text-gray-400 text-sm">Query too short</p>

  const matchingQuotes = await prisma.quote.findMany({
    where: {
      text: { contains: q },
      ...(showId || season ? {
        episode: {
          ...(showId ? { showId: Number(showId) } : {}),
          ...(season ? { season: Number(season) } : {}),
        }
      } : {}),
    },
    select: { clipId: true },
    distinct: ['clipId'],
    take: 30,
  })

  if (matchingQuotes.length === 0) {
    return <p className="mt-8 text-gray-400 text-sm">No results for &ldquo;{q}&rdquo;</p>
  }

  const clipIds = matchingQuotes.map(r => r.clipId)
  const clips = await prisma.clip.findMany({
    where: { id: { in: clipIds } },
    include: {
      episode: { include: { show: true } },
      quotes: {
        include: { speaker: true },
        orderBy: { sequence: 'asc' },
      },
    },
    orderBy: [
      { episode: { season: 'asc' } },
      { episode: { episodeNumber: 'asc' } },
      { id: 'asc' },
    ],
  })

  const lowerQ = q.toLowerCase()

  return (
    <div className="mt-8 space-y-4">
      <p className="text-sm text-gray-500">{clips.length} clip{clips.length !== 1 ? 's' : ''} found</p>

      {clips.map(clip => {
        const ep = clip.episode
        return (
          <div key={clip.id} className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
            <div className="bg-gray-50 dark:bg-gray-800 px-4 py-2 flex items-center justify-between text-sm">
              <span className="font-medium">
                {ep.show.name} &mdash; S{ep.season}E{ep.episodeNumber} &ldquo;{ep.title}&rdquo;
              </span>
              <span className="text-gray-400 text-xs">{clip.startTime} &ndash; {clip.stopTime}</span>
            </div>
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {clip.quotes.map(quote => {
                const isMatch = quote.text.toLowerCase().includes(lowerQ)
                return (
                  <div
                    key={quote.id}
                    className={`px-4 py-2 text-sm flex gap-3 ${isMatch ? 'bg-yellow-50 dark:bg-yellow-900/20' : ''}`}
                  >
                    <span className="text-gray-400 shrink-0 w-40 truncate">
                      {quote.speaker?.name ?? 'UNKNOWN'}
                    </span>
                    <span className={isMatch ? 'font-medium' : 'text-gray-600 dark:text-gray-400'}>
                      {quote.text}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
