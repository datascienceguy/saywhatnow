'use client'

import { useState } from 'react'

const SPEAKER_TYPES = ['MAIN', 'RECURRING', 'GUEST', 'ONE_TIME', 'OTHER']

type Speaker = {
  id: number
  name: string
  type: string
  imageUrl: string | null
}

export default function SpeakerEditForm({ speaker }: { speaker: Speaker }) {
  const [name, setName] = useState(speaker.name)
  const [type, setType] = useState(speaker.type)
  const [imageUrl, setImageUrl] = useState(speaker.imageUrl ?? '')
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [status, setStatus] = useState('')

  async function save() {
    setSaving(true); setStatus('')
    const res = await fetch(`/api/admin/speakers/${speaker.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.toUpperCase(), type, imageUrl: imageUrl || null }),
    })
    setSaving(false)
    setStatus(res.ok ? 'Saved.' : 'Error saving.')
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
        <img src={preview} alt={name} className="w-20 h-20 rounded-full object-cover bg-gray-800 border border-gray-700" />
        <div className="space-y-1">
          <label className="block text-xs text-gray-400 mb-1">Upload photo</label>
          <input
            type="file" accept="image/*"
            className="text-xs text-gray-400 file:mr-2 file:py-1 file:px-3 file:rounded file:border-0 file:bg-gray-700 file:text-gray-300 file:text-xs hover:file:bg-gray-600 cursor-pointer"
            onChange={e => { const f = e.target.files?.[0]; if (f) uploadImage(f) }}
          />
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
