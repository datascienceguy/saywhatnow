'use client'

import { useState } from 'react'
import Link from 'next/link'

type Speaker = {
  id: number
  name: string
  type: string
  imageUrl: string | null
  show: { name: string }
}

export default function SpeakerList({ speakers: initial }: { speakers: Speaker[] }) {
  const [speakers, setSpeakers] = useState(initial)
  const [search, setSearch] = useState('')
  const [showFilter, setShowFilter] = useState('')
  const [missingOnly, setMissingOnly] = useState(false)
  const [finding, setFinding] = useState<Set<number>>(new Set())
  const [statuses, setStatuses] = useState<Record<number, string>>({})

  const shows = [...new Set(speakers.map(s => s.show.name))].sort()

  const filtered = speakers.filter(s => {
    if (search && !s.name.toLowerCase().includes(search.toLowerCase())) return false
    if (showFilter && s.show.name !== showFilter) return false
    if (missingOnly && s.imageUrl) return false
    return true
  })

  async function findPhoto(e: React.MouseEvent, id: number) {
    e.preventDefault()
    setFinding(prev => new Set(prev).add(id))
    setStatuses(prev => ({ ...prev, [id]: '' }))
    const res = await fetch(`/api/admin/speakers/${id}/find-image`, { method: 'POST' })
    const data = await res.json()
    setFinding(prev => { const next = new Set(prev); next.delete(id); return next })
    if (res.ok) {
      setSpeakers(prev => prev.map(s => s.id === id ? { ...s, imageUrl: data.imageUrl } : s))
    } else {
      setStatuses(prev => ({ ...prev, [id]: 'not found' }))
    }
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <input
          autoFocus
          type="text"
          placeholder="Search speakers…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 min-w-48 bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-yellow-400"
        />
        <select
          value={showFilter}
          onChange={e => setShowFilter(e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-yellow-400"
        >
          <option value="">All Shows</option>
          {shows.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer select-none">
          <input type="checkbox" checked={missingOnly} onChange={e => setMissingOnly(e.target.checked)} className="accent-yellow-400" />
          Missing photo only
        </label>
      </div>

      <p className="text-xs text-gray-600">{filtered.length} of {speakers.length} speakers</p>

      {/* List */}
      <div className="space-y-1">
        {filtered.map(s => (
          <div key={s.id} className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-800 transition-colors group">
            <img
              src={s.imageUrl || '/default-avatar.svg'}
              alt={s.name}
              className="w-8 h-8 rounded-full object-cover bg-gray-700 shrink-0"
            />
            <Link href={`/admin/speakers/${s.id}`} className="flex-1 text-sm font-medium text-white hover:text-yellow-300 transition-colors">
              {s.name}
            </Link>
            <span className="text-xs text-gray-600">{s.show.name}</span>
            <span className={`text-xs px-2 py-0.5 rounded ${
              s.type === 'MAIN' ? 'bg-yellow-900 text-yellow-300' :
              s.type === 'RECURRING' ? 'bg-blue-900 text-blue-300' :
              'bg-gray-800 text-gray-500'
            }`}>{s.type}</span>
            {!s.imageUrl && (
              statuses[s.id] === 'not found'
                ? <span className="text-xs text-red-500">not found</span>
                : <button
                    onClick={e => findPhoto(e, s.id)}
                    disabled={finding.has(s.id)}
                    className="text-xs px-2 py-0.5 rounded bg-blue-900 text-blue-300 hover:bg-blue-800 disabled:opacity-40 transition-colors shrink-0"
                  >
                    {finding.has(s.id) ? '…' : '🔍 find photo'}
                  </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
