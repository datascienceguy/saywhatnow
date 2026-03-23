'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function NewStagingPage() {
  const router = useRouter()

  const [season, setSeason] = useState('')
  const [episodeNum, setEpisodeNum] = useState('')
  const [title, setTitle] = useState('')
  const [airDate, setAirDate] = useState('')
  const [productionCode, setProductionCode] = useState('')
  const [basename, setBasename] = useState('')
  const [tmdbLoading, setTmdbLoading] = useState(false)
  const [tmdbError, setTmdbError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  // Auto-generate basename from season/episode
  function updateBasename(s: string, e: string) {
    if (s && e) {
      setBasename(`s${String(s).padStart(2, '0')}e${String(e).padStart(2, '0')}`)
    }
  }

  async function fetchFromTmdb() {
    if (!season || !episodeNum) {
      setTmdbError('Enter season and episode number first.')
      return
    }
    setTmdbLoading(true)
    setTmdbError('')
    try {
      const res = await fetch(`/api/admin/tmdb?season=${season}&episode=${episodeNum}`)
      if (!res.ok) {
        const d = await res.json()
        setTmdbError(d.error ?? 'TMDB lookup failed')
        return
      }
      const d = await res.json()
      setTitle(d.title)
      setAirDate(d.airDate)
      setProductionCode(d.productionCode)
    } catch {
      setTmdbError('Network error')
    } finally {
      setTmdbLoading(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      const res = await fetch('/api/admin/staging', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ season: Number(season), episodeNumber: Number(episodeNum), title, airDate, productionCode, basename }),
      })
      if (!res.ok) {
        const d = await res.json()
        setError(d.error ?? 'Failed to create import')
        return
      }
      const d = await res.json()
      router.push(`/admin/staging/${d.id}`)
    } catch {
      setError('Network error')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <h1 className="text-2xl font-bold">New Episode Import</h1>
      <p className="text-gray-400 text-sm">
        Make sure you&apos;ve already run <code className="bg-gray-800 px-1 rounded">process-episode.py --full-mp4</code> and{' '}
        <code className="bg-gray-800 px-1 rounded">import-episode.py</code> to generate the video and quotes files in{' '}
        <code className="bg-gray-800 px-1 rounded">clip_prep/&lt;basename&gt;/</code>.
      </p>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Season + Episode */}
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="block text-sm text-gray-400 mb-1">Season</label>
            <input
              type="number" min="1" required value={season}
              onChange={e => { setSeason(e.target.value); updateBasename(e.target.value, episodeNum) }}
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white focus:outline-none focus:border-yellow-400"
            />
          </div>
          <div className="flex-1">
            <label className="block text-sm text-gray-400 mb-1">Episode</label>
            <input
              type="number" min="1" required value={episodeNum}
              onChange={e => { setEpisodeNum(e.target.value); updateBasename(season, e.target.value) }}
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white focus:outline-none focus:border-yellow-400"
            />
          </div>
          <div className="flex items-end">
            <button
              type="button" onClick={fetchFromTmdb} disabled={tmdbLoading}
              className="px-3 py-2 bg-blue-700 hover:bg-blue-600 disabled:opacity-50 rounded text-sm font-medium transition-colors"
            >
              {tmdbLoading ? 'Fetching…' : 'Fetch from TMDB'}
            </button>
          </div>
        </div>
        {tmdbError && <p className="text-red-400 text-sm">{tmdbError}</p>}

        {/* Title */}
        <div>
          <label className="block text-sm text-gray-400 mb-1">Title</label>
          <input
            type="text" required value={title}
            onChange={e => setTitle(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white focus:outline-none focus:border-yellow-400"
          />
        </div>

        {/* Air date + Production code */}
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="block text-sm text-gray-400 mb-1">Air Date</label>
            <input
              type="date" value={airDate}
              onChange={e => setAirDate(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white focus:outline-none focus:border-yellow-400"
            />
          </div>
          <div className="flex-1">
            <label className="block text-sm text-gray-400 mb-1">Production Code</label>
            <input
              type="text" value={productionCode}
              onChange={e => setProductionCode(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white focus:outline-none focus:border-yellow-400"
            />
          </div>
        </div>

        {/* Basename */}
        <div>
          <label className="block text-sm text-gray-400 mb-1">Basename</label>
          <input
            type="text" required value={basename}
            onChange={e => setBasename(e.target.value)}
            placeholder="e.g. s01e01"
            className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white font-mono focus:outline-none focus:border-yellow-400"
          />
          <p className="text-xs text-gray-500 mt-1">
            Must match the folder name in <code>clip_prep/</code>
          </p>
        </div>

        {error && <p className="text-red-400 text-sm">{error}</p>}

        <button
          type="submit" disabled={submitting}
          className="w-full bg-yellow-400 text-gray-950 font-semibold py-2 rounded hover:bg-yellow-300 disabled:opacity-50 transition-colors"
        >
          {submitting ? 'Creating…' : 'Create Import'}
        </button>
      </form>
    </div>
  )
}
