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
            {finding ? 'Searching wiki…' : '🔍 Find on Wiki'}
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
          <label className="block text-xs text-gray-400 mb-2">Focal Point — click the image to set where the face is</label>
          <div className="flex gap-4 items-start">
            {/* Full image — click to set focal point */}
            <div
              className="relative shrink-0 cursor-crosshair border border-gray-700 rounded overflow-hidden bg-gray-800"
              style={{ width: 200, height: 200 }}
              onClick={e => {
                const rect = e.currentTarget.getBoundingClientRect()
                const x = Math.round(((e.clientX - rect.left) / rect.width) * 100)
                const y = Math.round(((e.clientY - rect.top) / rect.height) * 100)
                setImagePosition(`${x}% ${y}%`)
              }}
            >
              <img src={preview} alt={name} className="w-full h-full object-contain" />
              {/* Focal point dot */}
              {(() => {
                const parts = imagePosition.match(/(\d+)%\s+(\d+)%/)
                if (!parts) return null
                return (
                  <div
                    className="absolute w-3 h-3 rounded-full border-2 border-white bg-red-500 pointer-events-none"
                    style={{ left: `calc(${parts[1]}% - 6px)`, top: `calc(${parts[2]}% - 6px)` }}
                  />
                )
              })()}
            </div>
            {/* Circle preview */}
            <div className="shrink-0">
              <div className="text-xs text-gray-500 mb-1">Preview</div>
              <div className="w-20 h-20 rounded-full overflow-hidden border border-gray-700 bg-gray-800">
                <img src={preview} alt={name} className="w-full h-full object-cover" style={{ objectPosition: imagePosition }} />
              </div>
              <div className="text-xs text-gray-600 mt-1 w-20 break-all">{imagePosition}</div>
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
