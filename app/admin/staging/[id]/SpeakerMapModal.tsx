'use client'

import { useState, useEffect } from 'react'

type Mapping = { stagingName: string; suggestedName: string | null; suggestedScore: number }
type Speaker = { id: number; name: string }

export default function SpeakerMapModal({
  episodeId,
  onClose,
  onApplied,
}: {
  episodeId: number
  onClose: () => void
  onApplied: (mapping: Record<string, string>) => void
}) {
  const [mappings, setMappings] = useState<Mapping[]>([])
  const [speakers, setSpeakers] = useState<Speaker[]>([])
  const [overrides, setOverrides] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch(`/api/admin/staging/${episodeId}/speaker-map`)
      .then(r => r.json())
      .then(data => {
        setMappings(data.mappings)
        setSpeakers(data.speakers)
        // Pre-populate overrides with suggestions
        const initial: Record<string, string> = {}
        for (const m of data.mappings) {
          initial[m.stagingName] = m.suggestedName ?? m.stagingName
        }
        setOverrides(initial)
        setLoading(false)
      })
      .catch(() => { setError('Failed to load'); setLoading(false) })
  }, [episodeId])

  async function apply() {
    setSaving(true)
    setError('')
    try {
      const res = await fetch(`/api/admin/staging/${episodeId}/speaker-map`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mapping: overrides }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      onApplied(overrides)
      onClose()
    } catch (e) {
      setError(String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70">
      <div className="bg-gray-900 border border-gray-700 rounded-lg shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <h2 className="font-semibold text-white">Map Speakers</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white">✕</button>
        </div>

        <div className="overflow-y-auto flex-1 p-4">
          {loading ? (
            <p className="text-gray-500 text-sm text-center py-8">Loading…</p>
          ) : (
            <>
              <p className="text-xs text-gray-500 mb-4">
                Match each transcript speaker name to a database speaker. Auto-suggestions shown — change any that are wrong.
              </p>
              <datalist id="speaker-map-list">
                {speakers.map(s => <option key={s.id} value={s.name} />)}
              </datalist>
              <div className="space-y-2">
                {mappings.map(m => {
                  const mapped = overrides[m.stagingName] ?? m.stagingName
                  const isExact = mapped === m.stagingName
                  const isNew = !speakers.some(s => s.name === mapped)
                  return (
                    <div key={m.stagingName} className="flex items-center gap-3">
                      <span className="text-sm text-gray-400 w-36 shrink-0 truncate" title={m.stagingName}>
                        {m.stagingName}
                      </span>
                      <span className="text-gray-600">→</span>
                      <input
                        list="speaker-map-list"
                        className="flex-1 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-yellow-400"
                        value={mapped}
                        onChange={e => setOverrides(prev => ({ ...prev, [m.stagingName]: e.target.value }))}
                      />
                      {isNew ? (
                        <span className="text-xs text-yellow-500 w-16 shrink-0">new</span>
                      ) : isExact && !speakers.some(s => s.name === mapped) ? (
                        <span className="text-xs text-red-500 w-16 shrink-0">no match</span>
                      ) : (
                        <span className="text-xs text-green-500 w-16 shrink-0">matched</span>
                      )}
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>

        <div className="px-5 py-4 border-t border-gray-800 flex items-center justify-between">
          {error && <span className="text-red-400 text-xs">{error}</span>}
          <div className="flex gap-2 ml-auto">
            <button onClick={onClose} className="px-4 py-1.5 bg-gray-700 rounded text-sm text-gray-300 hover:bg-gray-600">Cancel</button>
            <button onClick={apply} disabled={saving || loading} className="px-4 py-1.5 bg-yellow-400 text-gray-950 rounded text-sm font-semibold hover:bg-yellow-300 disabled:opacity-50">
              {saving ? 'Applying…' : 'Apply'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
