'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useState, useMemo } from 'react'

interface Show { id: number; name: string }
interface Episode { id: number; showId: number; season: number; episodeNumber: number; title: string }
interface Speaker { id: number; showId: number; name: string }

interface Props {
  shows: Show[]
  episodes: Episode[]
  speakers: Speaker[]
  lockedShowId?: number   // when set, hides the show dropdown and always filters to this show
  searchPath?: string     // where the form submits to (default '/')
}

export default function SearchForm({ shows, episodes, speakers, lockedShowId, searchPath = '/' }: Props) {
  const router = useRouter()
  const params = useSearchParams()

  const [q, setQ] = useState(params.get('q') ?? '')
  const [showId, setShowId] = useState(lockedShowId ? String(lockedShowId) : (params.get('showId') ?? ''))
  const [season, setSeason] = useState(params.get('season') ?? '')
  const [episodeId, setEpisodeId] = useState(params.get('episodeId') ?? '')
  const [speakerName, setSpeakerName] = useState(params.get('speakerName') ?? '')

  const seasons = useMemo(() => {
    if (!lockedShowId && !showId) return []
    return [...new Set(
      episodes
        .filter(e => lockedShowId ? true : e.showId === Number(showId))
        .map(e => e.season)
    )].sort((a, b) => a - b)
  }, [showId, lockedShowId, episodes])

  const filteredEpisodes = useMemo(() => {
    if (!lockedShowId && !showId) return []
    return episodes.filter(e =>
      (lockedShowId ? true : e.showId === Number(showId)) &&
      (!season || e.season === Number(season))
    )
  }, [showId, lockedShowId, season, episodes])

  const filteredSpeakers = useMemo(() => {
    if (!lockedShowId && !showId) return speakers
    return lockedShowId ? speakers : speakers.filter(s => s.showId === Number(showId))
  }, [showId, lockedShowId, speakers])

  function handleShowChange(val: string) {
    setShowId(val)
    setSeason('')
    setEpisodeId('')
    setSpeakerName('')
  }

  function handleSeasonChange(val: string) {
    setSeason(val)
    setEpisodeId('')
  }

  const submit = useCallback((e: React.FormEvent) => {
    e.preventDefault()
    const p = new URLSearchParams()
    if (q.trim()) p.set('q', q.trim())
    if (showId) p.set('showId', showId)
    if (season) p.set('season', season)
    if (episodeId) p.set('episodeId', episodeId)
    if (speakerName.trim()) p.set('speakerName', speakerName.trim())
    router.push(`${searchPath}?${p.toString()}`)
  }, [q, showId, season, episodeId, speakerName, router])

  const isDirty = q.trim() || (!lockedShowId && showId) || season || episodeId || speakerName.trim()

  function handleClear() {
    setQ('')
    if (!lockedShowId) setShowId('')
    setSeason('')
    setEpisodeId('')
    setSpeakerName('')
    router.push(searchPath)
  }

  const inputStyle = {
    border: '2px solid #1a1a1a',
    borderRadius: '6px',
    padding: '0.5rem 0.75rem',
    background: 'white',
    outline: 'none',
  }

  const filterStyle = {
    border: '1px solid #1a1a1a',
    borderRadius: '4px',
    padding: '0.2rem 0.4rem',
    background: 'white',
    fontSize: '0.8rem',
    outline: 'none',
  }

  const datalistId = 'speaker-list'

  return (
    <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <input
          type="text"
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Search quotes..."
          style={{ ...inputStyle, flex: 1 }}
          autoFocus
        />
        <button
          type="submit"
          style={{ padding: '0.5rem 1.25rem', background: '#FED90F', border: '2px solid #1a1a1a', borderRadius: '6px', fontWeight: 700, cursor: 'pointer', boxShadow: '2px 2px 0 #1a1a1a', whiteSpace: 'nowrap' }}
          onMouseOver={e => (e.currentTarget.style.background = '#F0C000')}
          onMouseOut={e => (e.currentTarget.style.background = '#FED90F')}
        >
          Search
        </button>
        {isDirty && (
          <button
            type="button"
            onClick={handleClear}
            style={{ padding: '0.5rem 0.75rem', background: 'white', border: '2px solid #1a1a1a', borderRadius: '6px', fontWeight: 600, cursor: 'pointer', color: '#555', whiteSpace: 'nowrap' }}
            onMouseOver={e => (e.currentTarget.style.background = '#f0f0f0')}
            onMouseOut={e => (e.currentTarget.style.background = 'white')}
          >
            Clear
          </button>
        )}
      </div>
      <div className="search-filters">
        {!lockedShowId && (
          <select value={showId} onChange={e => handleShowChange(e.target.value)} style={filterStyle}>
            <option value="">All Shows</option>
            {shows.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        )}
        <select value={season} onChange={e => handleSeasonChange(e.target.value)} style={filterStyle} disabled={!lockedShowId && !showId}>
          {(!lockedShowId && !showId) ? <option value="">Select a show first</option> : <option value="">All Seasons</option>}
          {seasons.map(n => <option key={n} value={n}>Season {n}</option>)}
        </select>
        <select value={episodeId} onChange={e => setEpisodeId(e.target.value)} style={{ ...filterStyle, flex: 1, minWidth: '10rem' }} disabled={!lockedShowId && !showId}>
          {(!lockedShowId && !showId) ? <option value="">Select a show first</option> : <option value="">All Episodes</option>}

          {filteredEpisodes.map(ep => (
            <option key={ep.id} value={ep.id}>S{ep.season}E{ep.episodeNumber} — {ep.title}</option>
          ))}
        </select>
        <input
          type="text"
          list={datalistId}
          value={speakerName}
          onChange={e => setSpeakerName(e.target.value)}
          placeholder="Speaker…"
          style={{ ...filterStyle, flex: 1, minWidth: '8rem' }}
        />
        <datalist id={datalistId}>
          {filteredSpeakers.map(s => <option key={s.id} value={s.name} />)}
        </datalist>
      </div>
    </form>
  )
}
