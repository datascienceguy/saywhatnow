export const dynamic = 'force-dynamic'

import { prisma } from '@/lib/prisma'
import Link from 'next/link'

export default async function StagingIndexPage() {
  const episodes = await prisma.stagingEpisode.findMany({
    include: { show: true },
    orderBy: [{ season: 'asc' }, { episodeNumber: 'asc' }],
  })

  const draft = episodes.filter(e => e.status === 'DRAFT')
  const complete = episodes.filter(e => e.status === 'COMPLETE')

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Episode Imports</h1>
        <Link
          href="/admin/staging/new"
          className="bg-yellow-400 text-gray-950 px-4 py-2 rounded font-semibold text-sm hover:bg-yellow-300 transition-colors"
        >
          + New Import
        </Link>
      </div>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400 mb-3">
          In Progress ({draft.length})
        </h2>
        {draft.length === 0 ? (
          <p className="text-gray-500 text-sm">No drafts.</p>
        ) : (
          <div className="space-y-2">
            {draft.map(ep => (
              <Link
                key={ep.id}
                href={`/admin/staging/${ep.id}`}
                className="flex items-center justify-between bg-gray-800 rounded-lg px-4 py-3 hover:bg-gray-700 transition-colors"
              >
                <div>
                  <span className="font-medium">{ep.show.name}</span>
                  <span className="text-gray-400 mx-2">·</span>
                  <span className="text-gray-300">
                    S{String(ep.season).padStart(2, '0')}E{String(ep.episodeNumber).padStart(2, '0')}
                  </span>
                  <span className="text-gray-400 mx-2">·</span>
                  <span className="text-gray-200">{ep.title}</span>
                  <span className="ml-3 text-xs text-gray-500 font-mono">{ep.basename}</span>
                </div>
                <span className="text-xs bg-yellow-900 text-yellow-300 px-2 py-1 rounded">DRAFT</span>
              </Link>
            ))}
          </div>
        )}
      </section>

      {complete.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400 mb-3">
            Completed ({complete.length})
          </h2>
          <div className="space-y-2">
            {complete.map(ep => (
              <div
                key={ep.id}
                className="flex items-center justify-between bg-gray-900 rounded-lg px-4 py-3"
              >
                <div>
                  <span className="font-medium">{ep.show.name}</span>
                  <span className="text-gray-400 mx-2">·</span>
                  <span className="text-gray-300">
                    S{String(ep.season).padStart(2, '0')}E{String(ep.episodeNumber).padStart(2, '0')}
                  </span>
                  <span className="text-gray-400 mx-2">·</span>
                  <span className="text-gray-200">{ep.title}</span>
                </div>
                <span className="text-xs bg-green-900 text-green-300 px-2 py-1 rounded">COMPLETE</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
