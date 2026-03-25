'use client'

import { useState } from 'react'

const SPEAKER_TYPES = ['MAIN', 'RECURRING', 'GUEST', 'ONE_TIME', 'OTHER']

type Speaker = {
  id: number
  name: string
  type: string
  imageUrl: string | null
  imagePosition: string | null
}

// 3x3 grid of focal point options (CSS object-position values)
const FOCAL_POINTS = [
  ['left top',    'center top',    'right top'],
  ['left center', 'center center', 'right center'],
  ['left bottom', 'center bottom', 'right bottom'],
]

export default function SpeakerEditForm({ speaker }: { speaker: Speaker }) {
  const [name, setName] = useState(speaker.name)
  const [type, setType] = useState(speaker.type)
  const [imageUrl, setImageUrl] = useState(speaker.imageUrl ?? '')
  const [imagePosition, setImagePosition] = useState(speaker.imagePosition ?? 'center center')
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [finding, setFinding] = useState(false)
  const [status, setStatus] = useState('')

  async function save() {
    setSaving(true); setStatus('')
    const res = await fetch(`/api/admin/speakers/${speaker.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.toUpperCase(), type, imageUrl: imageUrl || null, imagePosition: imagePosition || null }),
    })
    setSaving(false)
    setStatus(res.ok ? 'Saved.' : 'Error saving.')
  }

  async function findImage() {
    setFinding(true); setStatus('')
    const res = await fetch(`/api/admin/speakers/${speaker.id}/find-image`, { method: 'POST' })
    const data = await res.json()
    setFinding(false)
    if (res.ok) {
      setImageUrl(data.imageUrl)
      setStatus(`Found: ${data.wikiTitle}`)
    } else {
      setStatus(data.error || 'Not found')
    }
  }

  async function uploadImage(file: File) {
    setUploading(true); setStatus('')
    const form = new FormData()
    form.append('file', file)
    form.append('speakerId', String(speaker.id))
    const res = await fetch(`/api/admin/speakers/${speaker.id}/image`, { method: 'POST', body: form })
    setUploading(false)
    if (res.ok) {
      const { imageUrl: url } = await res.json()
      setImageUrl(url)
      setStatus('Image uploaded.')
    } else {
      setStatus('Upload failed.')
    }
  }

  const preview = imageUrl || '/default-avatar.svg'

  return (
    <div className="space-y-5">
      {/* Avatar */}
      <div className="flex items-center gap-4">
        <div className="relative">
        <img src={preview} alt={name} className="w-20 h-20 rounded-full object-cover bg-gray-800 border border-gray-700" style={{ objectPosition: imagePosition }} />
        {imageUrl && (
          <button onClick={() => setImageUrl('')} className="absolute -top-1 -right-1 w-5 h-5 bg-gray-700 hover:bg-red-700 rounded-full text-xs text-gray-300 hover:text-white flex items-center justify-center transition-colors" title="Remove photo">✕</button>
        )}
      </div>
        <div className="space-y-2">
          <button
            onClick={findImage} disabled={finding}
            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 rounded text-xs text-white font-medium transition-colors"
          >
            {finding ? 'Searching wiki…' : '🔍 Find on Simpsons Wiki'}
          </button>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Or upload manually</label>
            <input
              type="file" accept="image/*"
              className="text-xs text-gray-400 file:mr-2 file:py-1 file:px-3 file:rounded file:border-0 file:bg-gray-700 file:text-gray-300 file:text-xs hover:file:bg-gray-600 cursor-pointer"
              onChange={e => { const f = e.target.files?.[0]; if (f) uploadImage(f) }}
            />
          </div>
          {uploading && <p className="text-xs text-gray-500">Uploading…</p>}
        </div>
      </div>

      {/* Name */}
      <div>
        <label className="block text-xs text-gray-400 mb-1">Name</label>
        <input
          className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-yellow-400"
          value={name}
          onChange={e => setName(e.target.value.toUpperCase())}
        />
      </div>

      {/* Type */}
      <div>
        <label className="block text-xs text-gray-400 mb-1">Type</label>
        <select
          className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-yellow-400"
          value={type}
          onChange={e => setType(e.target.value)}
        >
          {SPEAKER_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      {/* Image URL */}
      <div>
        <label className="block text-xs text-gray-400 mb-1">Image URL (or upload above)</label>
        <input
          className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-yellow-400 font-mono"
          value={imageUrl}
          onChange={e => setImageUrl(e.target.value)}
          placeholder="/pictures/homer_simpson.png"
        />
      </div>

      {/* Focal point */}
      {imageUrl && (
        <div>
          <label className="block text-xs text-gray-400 mb-2">Focal Point (click to set where the face is)</label>
          <div className="flex gap-4 items-start">
            <div className="grid grid-cols-3 gap-0.5 w-16 shrink-0">
              {FOCAL_POINTS.map((row, ri) => row.map((pos, ci) => (
                <button
                  key={pos}
                  title={pos}
                  onClick={() => setImagePosition(pos)}
                  className={`w-5 h-5 rounded-sm border transition-colors ${imagePosition === pos ? 'bg-yellow-400 border-yellow-400' : 'bg-gray-700 border-gray-600 hover:bg-gray-600'}`}
                  style={ri === 0 && ci === 0 ? { borderTopLeftRadius: '4px' } : ri === 0 && ci === 2 ? { borderTopRightRadius: '4px' } : ri === 2 && ci === 0 ? { borderBottomLeftRadius: '4px' } : ri === 2 && ci === 2 ? { borderBottomRightRadius: '4px' } : {}}
                />
              )))}
            </div>
            <div className="w-20 h-20 rounded-full overflow-hidden border border-gray-700 bg-gray-800 shrink-0">
              <img src={preview} alt={name} className="w-full h-full object-cover" style={{ objectPosition: imagePosition }} />
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          onClick={save} disabled={saving}
          className="px-4 py-2 bg-yellow-400 text-gray-950 rounded text-sm font-semibold hover:bg-yellow-300 disabled:opacity-40 transition-colors"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        {status && <span className="text-xs text-gray-400">{status}</span>}
      </div>
    </div>
  )
}
