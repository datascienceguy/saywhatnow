'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useState } from 'react'

interface Show { id: number; name: string }

export default function SearchForm({ shows }: { shows: Show[] }) {
  const router = useRouter()
  const params = useSearchParams()

  const [q, setQ] = useState(params.get('q') ?? '')
  const [showId, setShowId] = useState(params.get('showId') ?? '')
  const [season, setSeason] = useState(params.get('season') ?? '')

  const submit = useCallback((e: React.FormEvent) => {
    e.preventDefault()
    const p = new URLSearchParams()
    if (q.trim()) p.set('q', q.trim())
    if (showId) p.set('showId', showId)
    if (season) p.set('season', season)
    router.push(`/?${p.toString()}`)
  }, [q, showId, season, router])

  return (
    <form onSubmit={submit} className="flex flex-wrap gap-2">
      <input
        type="text"
        value={q}
        onChange={e => setQ(e.target.value)}
        placeholder="Search quotes..."
        className="flex-1 min-w-64 px-4 py-2 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-yellow-400"
        autoFocus
      />
      <select
        value={showId}
        onChange={e => setShowId(e.target.value)}
        className="px-3 py-2 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800"
      >
        <option value="">All Shows</option>
        {shows.map(s => (
          <option key={s.id} value={s.id}>{s.name}</option>
        ))}
      </select>
      <input
        type="number"
        value={season}
        onChange={e => setSeason(e.target.value)}
        placeholder="Season"
        min={1}
        className="w-24 px-3 py-2 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800"
      />
      <button
        type="submit"
        className="px-6 py-2 bg-yellow-400 hover:bg-yellow-300 text-black font-semibold rounded"
      >
        Search
      </button>
    </form>
  )
}
