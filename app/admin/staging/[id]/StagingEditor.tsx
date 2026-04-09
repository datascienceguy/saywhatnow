'use client'

import { useRef, useState, useEffect } from 'react'
import SpeakerMapModal from './SpeakerMapModal'

type Quote = {
  id: number
  speaker: string
  text: string
  startTime: number | null
  endTime: number | null
  sequence: number
  stagingClipId: number | null
}

type Clip = {
  id: number
  index: number
  startTime: number | null
  endTime: number | null
}

type Episode = {
  id: number
  basename: string
  season: number
  episodeNumber: number
  title: string
  status: string
  show: { name: string }
  clips: Clip[]
  quotes: Quote[]
}

function fmtTime(s: number) {
  const m = Math.floor(s / 60)
  const sec = (s % 60).toFixed(1).padStart(4, '0')
  return `${m}:${sec}`
}

function deriveClips(quotes: Quote[], splits: Set<number>, episodeEndTime: number | null) {
  if (quotes.length === 0) return []
  const clips: Array<{ index: number; startTime: number; endTime: number }> = []
  let idx = 1
  for (let i = 0; i < quotes.length; i++) {
    const q = quotes[i]
    const isStart = i === 0 || splits.has(q.id)
    if (isStart) {
      const startTime = q.startTime ?? 0
      if (clips.length > 0) clips[clips.length - 1].endTime = startTime
      clips.push({ index: idx++, startTime, endTime: startTime + 60 })
    }
  }
  const lastQ = quotes[quotes.length - 1]
  if (clips.length > 0) clips[clips.length - 1].endTime = episodeEndTime ?? (lastQ.endTime ?? lastQ.startTime ?? 0) + 2
  return clips
}

function clipNumberAt(i: number, quotes: Quote[], splits: Set<number>) {
  let n = 1
  for (let j = 1; j <= i; j++) if (splits.has(quotes[j].id)) n++
  return n
}

export default function StagingEditor({ episode }: { episode: Episode }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const quoteRefs = useRef<Map<number, HTMLDivElement>>(new Map())
  const sorted = [...episode.quotes].sort((a, b) => a.sequence - b.sequence)

  const [quotes, setQuotes] = useState<Quote[]>(sorted)
  const [splits, setSplits] = useState<Set<number>>(() => {
    const clipsSorted = [...episode.clips].sort((a, b) => a.index - b.index)
    const ids = new Set<number>()
    for (let i = 1; i < clipsSorted.length; i++) {
      const first = sorted
        .filter(q => q.stagingClipId === clipsSorted[i].id)
        .sort((a, b) => a.sequence - b.sequence)[0]
      if (first) ids.add(first.id)
    }
    return ids
  })

  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [editingQuoteId, setEditingQuoteId] = useState<{ id: number; focusField?: 'speaker' | 'text' } | null>(null)
  const [speakers, setSpeakers] = useState<{ id: number; name: string }[]>([])
  const [showSpeakerMap, setShowSpeakerMap] = useState(false)
  const [saving, setSaving] = useState(false)
  const [autoSaveStatus, setAutoSaveStatus] = useState<'saved' | 'saving' | 'error' | null>(null)
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [finalizing, setFinalizing] = useState(false)
  const [finalizeLog, setFinalizeLog] = useState<string[]>([])
  const [error, setError] = useState('')
  const [activeQuoteId, setActiveQuoteId] = useState<number | null>(null)
  const [insertingAt, setInsertingAt] = useState<number | null>(null)
  const [newQuote, setNewQuote] = useState({ speaker: '', text: '' })
  const [dragQuoteId, setDragQuoteId] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const [episodeEndTime, setEpisodeEndTime] = useState<number | null>(() => {
    const last = [...episode.clips].sort((a, b) => b.index - a.index)[0]
    return last ? last.endTime : null
  })

  const derivedClips = deriveClips(quotes, splits, episodeEndTime)

  useEffect(() => {
    fetch(`/api/admin/staging/${episode.id}/speakers`)
      .then(r => r.json()).then(setSpeakers).catch(() => {})
  }, [episode.id])

  useEffect(() => {
    const t = currentTime
    const candidates = quotes.filter(q => q.startTime != null && q.startTime <= t)
    if (candidates.length === 0) { setActiveQuoteId(null); return }
    const active = candidates.reduce((best, q) => q.startTime! > best.startTime! ? q : best)
    const nextQuote = quotes.find(q => q.startTime != null && q.startTime > active.startTime!)
    const effectiveEnd = active.endTime ?? nextQuote?.startTime ?? Infinity
    setActiveQuoteId(t <= effectiveEnd + 0.5 ? active.id : null)
  }, [currentTime, quotes])

  useEffect(() => {
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current)
    autoSaveTimer.current = setTimeout(async () => {
      setAutoSaveStatus('saving')
      try {
        const res = await fetch(`/api/admin/staging/${episode.id}/clips`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ clips: deriveClips(quotes, splits, episodeEndTime) }),
        })
        setAutoSaveStatus(res.ok ? 'saved' : 'error')
      } catch { setAutoSaveStatus('error') }
    }, 2000)
    return () => { if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current) }
  }, [splits, episodeEndTime])

  const seekTo = (time: number) => {
    if (videoRef.current) videoRef.current.currentTime = time
  }

  const jumpToClip = (clip: { startTime: number; endTime: number }) => {
    seekTo(clip.startTime)
    const first = quotes
      .filter(q => q.startTime != null && q.startTime >= clip.startTime && q.startTime < clip.endTime)
      .sort((a, b) => a.startTime! - b.startTime!)[0]
    if (first) quoteRefs.current.get(first.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  function toggleSplit(quoteId: number) {
    setSplits(prev => {
      const next = new Set(prev)
      if (next.has(quoteId)) next.delete(quoteId)
      else next.add(quoteId)
      return next
    })
  }

  async function saveClips() {
    setSaving(true); setError('')
    try {
      const res = await fetch(`/api/admin/staging/${episode.id}/clips`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clips: derivedClips }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      const ep = await (await fetch(`/api/admin/staging/${episode.id}`)).json()
      setQuotes([...ep.quotes].sort((a: Quote, b: Quote) => a.sequence - b.sequence))
    } catch (e) { setError(String(e)) }
    finally { setSaving(false) }
  }

  async function saveQuote(id: number, speaker: string, text: string) {
    setError('')
    try {
      const res = await fetch(`/api/admin/staging/${episode.id}/quotes/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ speaker, text }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      setQuotes(prev => prev.map(q => q.id === id ? { ...q, speaker, text } : q))
      setEditingQuoteId(null)
    } catch (e) { setError(String(e)) }
  }

  async function addQuote(afterIndex: number) {
    setError('')
    const prev = quotes[afterIndex]
    const next = quotes[afterIndex + 1]
    const sequence = afterIndex === -1
      ? (quotes[0]?.sequence ?? 1) - 1
      : next ? (prev.sequence + next.sequence) / 2 : (prev?.sequence ?? 0) + 1
    try {
      const res = await fetch(`/api/admin/staging/${episode.id}/quotes`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ speaker: newQuote.speaker, text: newQuote.text, startTime: currentTime || null, sequence }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      const q = await res.json()
      setQuotes(prev => { const u = [...prev]; u.splice(afterIndex + 1 < 0 ? 0 : afterIndex + 1, 0, q); return u })
      setNewQuote({ speaker: '', text: '' }); setInsertingAt(null)
    } catch (e) { setError(String(e)) }
  }

  async function reorderQuotes(fromId: number, toIndex: number) {
    const fromIndex = quotes.findIndex(q => q.id === fromId)
    if (fromIndex === -1 || fromIndex === toIndex) return
    const reordered = [...quotes]
    const [moved] = reordered.splice(fromIndex, 1)
    reordered.splice(toIndex, 0, moved)
    const withSequences = reordered.map((q, i) => ({ ...q, sequence: i }))
    setQuotes(withSequences)
    const order = withSequences.map(q => ({ id: q.id, sequence: q.sequence }))
    await fetch(`/api/admin/staging/${episode.id}/quotes`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order }),
    })
  }

  async function deleteQuote(id: number) {
    setError('')
    try {
      await fetch(`/api/admin/staging/${episode.id}/quotes/${id}`, { method: 'DELETE' })
      setQuotes(prev => prev.filter(q => q.id !== id))
      setSplits(prev => { const next = new Set(prev); next.delete(id); return next })
    } catch (e) { setError(String(e)) }
  }

  async function reset() {
    if (!confirm('Reset all clip boundaries? All clips will be cleared and quotes restored in order.')) return
    setError('')
    try {
      const res = await fetch(`/api/admin/staging/${episode.id}/reset`, { method: 'POST' })
      if (!res.ok) throw new Error((await res.json()).error)
      const data = await res.json()
      setQuotes([...data.quotes].sort((a: Quote, b: Quote) => a.sequence - b.sequence))
      setSplits(new Set())
    } catch (e) { setError(String(e)) }
  }

  async function finalize() {
    if (!confirm(`Finalize "${episode.title}"? This will cut ${derivedClips.length} clips with ffmpeg and import to the database. Cannot be undone.`)) return
    setFinalizing(true); setFinalizeLog([]); setError('')
    try {
      const res = await fetch(`/api/admin/staging/${episode.id}/finalize`, { method: 'POST' })
      if (!res.body) throw new Error('No response body')
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const event = JSON.parse(line.slice(6))
          if (event.msg) setFinalizeLog(prev => [...prev, event.msg])
          if (event.done) {
            if (event.error) { setError(event.error); return }
            setTimeout(() => { window.location.href = '/admin/staging' }, 1500)
          }
        }
      }
    } catch (e) { setError(String(e)) }
    finally { setFinalizing(false) }
  }

  const quoteCountPerClip = (clip: { startTime: number; endTime: number }) =>
    quotes.filter(q => q.startTime != null && q.startTime >= clip.startTime && q.startTime < clip.endTime).length

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-gray-950 text-white">

      {/* Header */}
      <div className="flex items-center justify-between px-5 py-2.5 bg-gray-900 border-b border-gray-800 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-semibold text-white truncate">{episode.title}</span>
          <span className="text-gray-600">·</span>
          <span className="text-gray-400 text-sm shrink-0">
            S{String(episode.season).padStart(2, '0')}E{String(episode.episodeNumber).padStart(2, '0')}
          </span>
          <span className="text-gray-600">·</span>
          <span className="text-gray-500 text-sm shrink-0">{episode.show.name}</span>
          <span className="text-gray-700 text-xs font-mono ml-1 shrink-0">{episode.basename}</span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {error && <span className="text-red-400 text-xs max-w-48 truncate">{error}</span>}
          {autoSaveStatus === 'saving' && <span className="text-xs text-gray-500">saving…</span>}
          {autoSaveStatus === 'saved' && <span className="text-xs text-gray-600">✓ saved</span>}
          {autoSaveStatus === 'error' && <span className="text-xs text-red-500">autosave failed</span>}
          <span className="text-xs text-gray-600 px-2">{derivedClips.length} clips · {quotes.length} quotes</span>

          {/* Secondary actions */}
          <div className="flex items-center gap-1 border-r border-gray-700 pr-2 mr-1">
            <button onClick={() => setShowSpeakerMap(true)} className="px-2.5 py-1.5 bg-gray-800 hover:bg-gray-700 rounded text-xs text-gray-300 hover:text-white transition-colors">
              Map Speakers
            </button>
            <button onClick={reset} className="px-2.5 py-1.5 bg-gray-800 hover:bg-gray-700 rounded text-xs text-gray-400 hover:text-red-400 transition-colors">
              Reset
            </button>
          </div>

          {/* Primary actions */}
          <button onClick={finalize} disabled={finalizing || derivedClips.length === 0} className="px-3 py-1.5 bg-yellow-400 text-gray-950 hover:bg-yellow-300 disabled:opacity-40 rounded text-sm font-semibold transition-colors">
            {finalizing ? 'Finalizing…' : 'Finalize & Import'}
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">

        {/* Left panel */}
        <div className="w-1/2 flex flex-col border-r border-gray-800 overflow-hidden">
          <video
            ref={videoRef}
            src={`/api/admin/staging/${episode.id}/video`}
            controls
            className="w-full bg-black shrink-0"
            style={{ maxHeight: '60vh' }}
            onTimeUpdate={e => setCurrentTime(e.currentTarget.currentTime)}
            onLoadedMetadata={e => setDuration(e.currentTarget.duration)}
          />

          {/* Nudge controls */}
          <div className="flex items-center gap-2 px-4 py-2 bg-gray-900 border-b border-gray-800 shrink-0">
            <span className="text-xs text-gray-600 w-10 shrink-0">Nudge</span>
            <div className="flex gap-1">
              {([-1, -0.1, 0.1, 1] as const).map(delta => (
                <button
                  key={delta}
                  onClick={() => seekTo(Math.max(0, currentTime + delta))}
                  className="px-2.5 py-1 bg-gray-800 hover:bg-gray-700 rounded text-xs font-mono text-gray-400 hover:text-white transition-colors"
                >
                  {delta > 0 ? `+${delta}s` : `${delta}s`}
                </button>
              ))}
            </div>
            <span className="text-xs font-mono text-blue-400 ml-auto">{fmtTime(currentTime)}</span>
          </div>

          {/* Clip timeline */}
          {(() => {
            const scale = duration > 0 ? duration : (derivedClips.at(-1)?.endTime ?? 1)
            return (
              <div
                className="relative h-10 bg-gray-950 border-b border-gray-800 shrink-0 cursor-pointer"
                onClick={e => {
                  if (!duration) return
                  const rect = e.currentTarget.getBoundingClientRect()
                  seekTo(((e.clientX - rect.left) / rect.width) * duration)
                }}
              >
                {derivedClips.map(c => (
                  <div
                    key={c.index}
                    onClick={e => { e.stopPropagation(); jumpToClip(c) }}
                    className="absolute top-1 h-8 bg-blue-800 hover:bg-blue-700 border border-blue-600 rounded flex items-center justify-center cursor-pointer transition-colors"
                    style={{ left: `${(c.startTime / scale) * 100}%`, width: `${Math.max(((c.endTime - c.startTime) / scale) * 100, 0.5)}%` }}
                  >
                    <span className="text-xs text-blue-300 font-mono leading-none">{c.index}</span>
                  </div>
                ))}
                {duration > 0 && (
                  <div className="absolute top-0 bottom-0 w-px bg-red-500 pointer-events-none" style={{ left: `${(currentTime / duration) * 100}%` }} />
                )}
              </div>
            )
          })()}

          {/* Clip list */}
          <div className="overflow-y-auto flex-1">
            {derivedClips.length === 0 ? (
              <p className="text-xs text-gray-600 text-center mt-8 px-4">
                Hover between quotes on the right and click "✂ New clip" to add clip boundaries
              </p>
            ) : (
              <table className="w-full text-xs">
                <tbody>
                  {derivedClips.map(c => {
                    const qCount = quoteCountPerClip(c)
                    return (
                      <tr key={c.index} className="border-b border-gray-800 hover:bg-gray-900 transition-colors">
                        <td className="pl-4 pr-2 py-2 font-mono text-blue-400 w-8">{c.index}</td>
                        <td className="py-2 font-mono">
                          <button onClick={() => seekTo(c.startTime)} className="text-gray-400 hover:text-white transition-colors">{fmtTime(c.startTime)}</button>
                          <span className="text-gray-700 mx-1.5">–</span>
                          <button onClick={() => seekTo(c.endTime)} className="text-gray-400 hover:text-white transition-colors">{fmtTime(c.endTime)}</button>
                        </td>
                        <td className="py-2 text-gray-600 pr-2">{(c.endTime - c.startTime).toFixed(1)}s</td>
                        <td className="py-2 pr-4 text-gray-600 text-right">{qCount} {qCount === 1 ? 'line' : 'lines'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Right panel — quotes */}
        <div className="w-1/2 overflow-y-auto">
          <div className="p-2">
            <InlineDivider
              splitActive={false}
              nextClipNumber={0}
              insertingHere={insertingAt === -1}
              newQuote={newQuote}
              currentTime={currentTime}
              showClipSplit={false}
              onToggleSplit={() => {}}
              onStartInsert={() => { setInsertingAt(-1); setNewQuote({ speaker: '', text: '' }) }}
              onCancelInsert={() => { setInsertingAt(null); setNewQuote({ speaker: '', text: '' }) }}
              onChangeNewQuote={setNewQuote}
              onAddQuote={() => addQuote(-1)}
              speakers={speakers}
            />
            {quotes.map((q, i) => (
              <div key={q.id} ref={el => { if (el) quoteRefs.current.set(q.id, el); else quoteRefs.current.delete(q.id) }}>
                <QuoteRow
                  quote={q}
                  active={activeQuoteId === q.id}
                  currentTime={currentTime}
                  editingQuoteId={editingQuoteId}
                  speakers={speakers}
                  isDragging={dragQuoteId === q.id}
                  isDragOver={dragOverIndex === i}
                  onDragStart={() => setDragQuoteId(q.id)}
                  onDragOver={() => setDragOverIndex(i)}
                  onDragEnd={() => {
                    if (dragQuoteId !== null && dragOverIndex !== null) reorderQuotes(dragQuoteId, dragOverIndex)
                    setDragQuoteId(null); setDragOverIndex(null)
                  }}
                  onSeek={seekTo}
                  onStartEdit={setEditingQuoteId}
                  onSaveEdit={saveQuote}
                  onCancelEdit={() => setEditingQuoteId(null)}
                  onDelete={deleteQuote}
                  onSplit={async () => {
                    const next = quotes[i + 1]
                    const sequence = next ? (q.sequence + next.sequence) / 2 : q.sequence + 1
                    const res = await fetch(`/api/admin/staging/${episode.id}/quotes`, {
                      method: 'POST', headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ speaker: q.speaker, text: q.text, startTime: currentTime, sequence }),
                    })
                    if (res.ok) {
                      const newQ = await res.json()
                      setQuotes(prev => { const u = [...prev]; u.splice(i + 1, 0, newQ); return u })
                    }
                  }}
                  onStampTime={async (id, t) => {
                    await fetch(`/api/admin/staging/${episode.id}/quotes/${id}`, {
                      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ startTime: t }),
                    })
                    setQuotes(prev => prev.map(q => q.id === id ? { ...q, startTime: t } : q))
                  }}
                />
                <InlineDivider
                  splitActive={splits.has(quotes[i + 1]?.id)}
                  nextClipNumber={i < quotes.length - 1 ? clipNumberAt(i + 1, quotes, splits) + (splits.has(quotes[i + 1].id) ? 0 : 1) : 0}
                  insertingHere={insertingAt === i}
                  newQuote={newQuote}
                  currentTime={currentTime}
                  showClipSplit={i < quotes.length - 1}
                  onToggleSplit={() => i < quotes.length - 1 && toggleSplit(quotes[i + 1].id)}
                  onStartInsert={() => { setInsertingAt(i); setNewQuote({ speaker: '', text: '' }) }}
                  onCancelInsert={() => { setInsertingAt(null); setNewQuote({ speaker: '', text: '' }) }}
                  onChangeNewQuote={setNewQuote}
                  onAddQuote={() => addQuote(i)}
                  speakers={speakers}
                  onMerge={i < quotes.length - 1 ? async () => {
                    const upper = quotes[i], lower = quotes[i + 1]
                    const merged = `${upper.text} ${lower.text}`
                    await fetch(`/api/admin/staging/${episode.id}/quotes/${upper.id}`, {
                      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ text: merged }),
                    })
                    await fetch(`/api/admin/staging/${episode.id}/quotes/${lower.id}`, { method: 'DELETE' })
                    setSplits(prev => { const next = new Set(prev); next.delete(lower.id); return next })
                    setQuotes(prev => prev.filter(q => q.id !== lower.id).map(q => q.id === upper.id ? { ...q, text: merged } : q))
                  } : undefined}
                />
              </div>
            ))}
            {/* Episode end marker */}
            <div className="mt-2 flex items-center gap-2 px-2 py-1.5 border border-dashed border-gray-700 rounded group hover:border-gray-500 transition-colors">
              <span className="text-xs text-gray-600 flex-1">
                {episodeEndTime != null ? (
                  <>end of last clip: <button onClick={() => seekTo(episodeEndTime)} className="font-mono text-blue-400 hover:text-blue-300">{fmtTime(episodeEndTime)}</button></>
                ) : (
                  <span className="italic">no end marker set — last clip ends 2s after final quote</span>
                )}
              </span>
              <button
                onClick={() => setEpisodeEndTime(currentTime)}
                className="px-2 py-0.5 bg-gray-800 hover:bg-gray-700 rounded text-xs text-gray-400 hover:text-white transition-colors shrink-0"
                title={`Set end of last clip @ ${fmtTime(currentTime)}`}
              >
                ⏹ end here
              </button>
              {episodeEndTime != null && (
                <button onClick={() => setEpisodeEndTime(null)} className="text-gray-700 hover:text-red-400 text-xs px-1 transition-colors" title="Clear end marker">✕</button>
              )}
            </div>
          </div>
        </div>
      </div>

      {finalizing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-80">
          <div className="bg-gray-900 border border-gray-700 rounded-lg shadow-2xl w-full max-w-lg flex flex-col" style={{ maxHeight: '70vh' }}>
            <div className="px-5 py-3 border-b border-gray-800 flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
              <span className="font-semibold text-white text-sm">Finalizing…</span>
            </div>
            <div className="overflow-y-auto flex-1 p-4 font-mono text-xs text-gray-300 space-y-1">
              {finalizeLog.map((line, i) => (
                <div key={i} className={line.startsWith('  ') ? 'text-gray-500 pl-4' : ''}>{line}</div>
              ))}
            </div>
          </div>
        </div>
      )}

      {showSpeakerMap && (
        <SpeakerMapModal
          episodeId={episode.id}
          onClose={() => setShowSpeakerMap(false)}
          onApplied={mapping => {
            setQuotes(prev => prev.map(q => ({ ...q, speaker: mapping[q.speaker] ?? q.speaker })))
          }}
        />
      )}
    </div>
  )
}

function InlineDivider({
  splitActive, nextClipNumber, insertingHere, newQuote, currentTime, speakers,
  showClipSplit, onToggleSplit, onStartInsert, onCancelInsert, onChangeNewQuote, onAddQuote, onMerge,
}: {
  splitActive: boolean; nextClipNumber: number; insertingHere: boolean
  newQuote: { speaker: string; text: string }; currentTime: number
  speakers: { id: number; name: string }[]; showClipSplit: boolean
  onToggleSplit: () => void; onStartInsert: () => void; onCancelInsert: () => void
  onChangeNewQuote: (q: { speaker: string; text: string }) => void
  onAddQuote: () => void; onMerge?: () => void
}) {
  if (insertingHere) {
    return (
      <div className="my-1.5 border border-dashed border-yellow-700 rounded-lg p-2.5 space-y-2 bg-gray-900">
        <datalist id="new-quote-speakers">
          {speakers.map(s => <option key={s.id} value={s.name} />)}
        </datalist>
        <div className="flex items-center gap-2">
          <input
            autoFocus list="new-quote-speakers"
            className="w-36 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-yellow-400"
            placeholder="Speaker"
            value={newQuote.speaker}
            onChange={e => onChangeNewQuote({ ...newQuote, speaker: e.target.value })}
          />
          <span className="text-xs font-mono text-green-500 opacity-70">@ {fmtTime(currentTime)}</span>
        </div>
        <textarea
          className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-yellow-400 resize-none"
          rows={2} placeholder="Quote text"
          value={newQuote.text}
          onChange={e => onChangeNewQuote({ ...newQuote, text: e.target.value })}
        />
        <div className="flex gap-2">
          <button onClick={onAddQuote} className="px-3 py-1 bg-yellow-400 text-gray-950 rounded text-xs font-semibold">Add</button>
          <button onClick={onCancelInsert} className="px-3 py-1 bg-gray-700 rounded text-xs text-gray-300 hover:bg-gray-600">Cancel</button>
        </div>
      </div>
    )
  }

  return (
    <div className="group relative py-px">
      {splitActive && (
        <div className="flex items-center gap-2 my-1.5">
          <div className="flex-1 h-px bg-blue-600" />
          <button
            onClick={onToggleSplit}
            className="text-xs font-medium text-blue-300 bg-blue-950 px-2.5 py-0.5 rounded-full border border-blue-700 hover:border-blue-400 hover:text-blue-200 whitespace-nowrap transition-colors select-none"
          >
            ✂ Clip {nextClipNumber}
          </button>
          <div className="flex-1 h-px bg-blue-600" />
        </div>
      )}
      <div className="flex items-center justify-center gap-1.5 py-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        {showClipSplit && (
          <button onClick={onToggleSplit} className="text-xs text-gray-600 hover:text-blue-400 px-2 py-0.5 rounded border border-transparent hover:border-blue-800 whitespace-nowrap transition-colors">
            ✂ clip
          </button>
        )}
        <button onClick={onStartInsert} className="text-xs text-gray-600 hover:text-yellow-400 px-2 py-0.5 rounded border border-transparent hover:border-yellow-800 whitespace-nowrap transition-colors">
          ＋ quote
        </button>
        {onMerge && (
          <button onClick={onMerge} className="text-xs text-gray-600 hover:text-purple-400 px-2 py-0.5 rounded border border-transparent hover:border-purple-800 whitespace-nowrap transition-colors">
            ⊕ merge
          </button>
        )}
      </div>
    </div>
  )
}

function QuoteRow({
  quote, active, currentTime, editingQuoteId, speakers, isDragging, isDragOver,
  onSeek, onStartEdit, onSaveEdit, onCancelEdit, onDelete, onSplit, onStampTime,
  onDragStart, onDragOver, onDragEnd,
}: {
  quote: Quote; active: boolean; currentTime: number
  editingQuoteId: { id: number; focusField?: 'speaker' | 'text' } | null
  speakers: { id: number; name: string }[]
  isDragging: boolean; isDragOver: boolean
  onSeek: (t: number) => void
  onStartEdit: (q: { id: number; focusField?: 'speaker' | 'text' }) => void
  onSaveEdit: (id: number, speaker: string, text: string) => void
  onCancelEdit: () => void
  onDelete: (id: number) => void; onSplit: () => void; onStampTime: (id: number, t: number) => void
  onDragStart: () => void; onDragOver: () => void; onDragEnd: () => void
}) {
  const isEditing = editingQuoteId?.id === quote.id
  const [localSpeaker, setLocalSpeaker] = useState(quote.speaker)
  const [localText, setLocalText] = useState(quote.text)

  useEffect(() => {
    if (isEditing) { setLocalSpeaker(quote.speaker); setLocalText(quote.text) }
  }, [isEditing])

  if (isEditing) {
    return (
      <div className="my-1 border border-yellow-600 rounded-lg p-2.5 space-y-2 bg-gray-900">
        <datalist id={`speakers-${quote.id}`}>
          {speakers.map(s => <option key={s.id} value={s.name} />)}
        </datalist>
        <input
          autoFocus={editingQuoteId?.focusField !== 'text'} list={`speakers-${quote.id}`}
          className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-yellow-400"
          value={localSpeaker}
          onChange={e => setLocalSpeaker(e.target.value)}
          placeholder="Speaker"
          onKeyDown={e => { if (e.key === 'Enter') onSaveEdit(quote.id, localSpeaker, localText) }}
        />
        <textarea
          autoFocus={editingQuoteId?.focusField === 'text'}
          className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-yellow-400 resize-none"
          rows={2}
          value={localText}
          onChange={e => setLocalText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) onSaveEdit(quote.id, localSpeaker, localText) }}
        />
        <div className="flex gap-2">
          <button onClick={() => onSaveEdit(quote.id, localSpeaker, localText)} className="px-3 py-1 bg-yellow-400 text-gray-950 rounded text-xs font-semibold">Save</button>
          <button onClick={onCancelEdit} className="px-3 py-1 bg-gray-700 rounded text-xs text-gray-400 hover:bg-gray-600">Cancel</button>
        </div>
      </div>
    )
  }

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={e => { e.preventDefault(); onDragOver() }}
      onDragEnd={onDragEnd}
      className={`flex items-start gap-2 px-2 py-1.5 rounded text-sm group transition-colors cursor-default
        ${isDragging ? 'opacity-40' : ''}
        ${isDragOver ? 'border-t-2 border-blue-400' : 'border-t-2 border-transparent'}
        ${active ? 'bg-yellow-950 border-l-2 border-yellow-500' : 'hover:bg-gray-900'}`}
    >
      {/* Drag handle */}
      <div className="text-gray-700 hover:text-gray-400 cursor-grab active:cursor-grabbing mt-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity select-none" title="Drag to reorder">⠿</div>
      {/* Timestamp + stamp button */}
      <div className="flex items-center gap-0.5 mt-0.5 shrink-0">
        {quote.startTime != null ? (
          <button onClick={() => onSeek(quote.startTime!)} className="text-xs font-mono text-gray-600 hover:text-blue-400 transition-colors w-14 text-right" title="Seek to line">
            {fmtTime(quote.startTime)}
          </button>
        ) : (
          <span className="text-xs font-mono text-gray-800 w-14 text-right">—</span>
        )}
        <button
          onClick={() => onStampTime(quote.id, currentTime)}
          className="text-gray-800 hover:text-green-400 group-hover:text-gray-600 px-0.5 transition-colors"
          title={`Stamp @ ${fmtTime(currentTime)}`}
        >⊙</button>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <span
          className="font-semibold text-yellow-200 cursor-pointer hover:text-yellow-100 hover:underline"
          onClick={() => onStartEdit({ id: quote.id, focusField: 'speaker' })}
          title="Click to edit speaker"
        >{quote.speaker}</span>
        <span className="text-gray-500">: </span>
        <span
          className="text-gray-300 cursor-pointer hover:text-white"
          onClick={() => onStartEdit({ id: quote.id, focusField: 'text' })}
          title="Click to edit text"
        >{quote.text}</span>
      </div>

      {/* Actions */}
      <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-0.5">
        <button onClick={() => onStartEdit({ id: quote.id })} className="text-gray-600 hover:text-yellow-400 px-1 py-0.5 rounded hover:bg-gray-800 transition-colors" title="Edit">✎</button>
        <button onClick={onSplit} className="text-gray-600 hover:text-blue-400 px-1 py-0.5 rounded hover:bg-gray-800 transition-colors" title={`Split @ ${fmtTime(currentTime)}`}>⧉</button>
        <button onClick={() => onDelete(quote.id)} className="text-gray-600 hover:text-red-400 px-1 py-0.5 rounded hover:bg-gray-800 transition-colors" title="Delete">✕</button>
      </div>
    </div>
  )
}
