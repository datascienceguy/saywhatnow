'use client'

import { useState } from 'react'
import Link from 'next/link'

interface Speaker {
  id: number
  name: string
  imageUrl: string
}

interface QuoteData {
  id: number
  text: string
  clipId: number
  correctSpeakerId: number
  episode: { season: number; episodeNumber: number; title: string }
  choices: Speaker[]
}

const MAX_GUESSES = 3

export default function MatchQuoteGame({ initialQuote }: { initialQuote: QuoteData }) {
  const [quote, setQuote] = useState(initialQuote)
  const [wrongIds, setWrongIds] = useState<Set<number>>(new Set())
  const [won, setWon] = useState(false)
  const [loading, setLoading] = useState(false)

  const wrongCount = wrongIds.size
  const lost = wrongCount >= MAX_GUESSES
  const gameOver = won || lost

  function guess(speakerId: number) {
    if (gameOver || wrongIds.has(speakerId)) return
    if (speakerId === quote.correctSpeakerId) {
      setWon(true)
    } else {
      setWrongIds(prev => new Set([...prev, speakerId]))
    }
  }

  async function newQuote() {
    setLoading(true)
    try {
      const res = await fetch('/api/games/match-quote')
      const data = await res.json()
      setQuote(data)
      setWrongIds(new Set())
      setWon(false)
    } finally {
      setLoading(false)
    }
  }

  const guessesLeft = MAX_GUESSES - wrongCount

  return (
    <div style={{ maxWidth: '620px', margin: '2rem auto', padding: '0 1rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

      {/* Quote */}
      <div style={{ background: 'white', border: '2px solid #1a1a1a', borderRadius: '8px', padding: '1.5rem', boxShadow: '3px 3px 0 #1a1a1a', textAlign: 'center' }}>
        <div style={{ fontSize: '0.65rem', fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.75rem' }}>
          Who said this?
        </div>
        <p style={{ margin: 0, fontSize: '1.1rem', fontStyle: 'italic', color: '#1a1a1a', lineHeight: 1.5 }}>
          &ldquo;{quote.text}&rdquo;
        </p>
        {gameOver && (
          <p style={{ margin: '0.75rem 0 0', fontSize: '0.75rem', color: '#888' }}>
            S{quote.episode.season}E{quote.episode.episodeNumber} &mdash; {quote.episode.title}
          </p>
        )}
      </div>

      {/* Status */}
      {!gameOver && (
        <div style={{ textAlign: 'center', fontSize: '0.8rem', color: '#555' }}>
          {guessesLeft} guess{guessesLeft !== 1 ? 'es' : ''} remaining
        </div>
      )}

      {/* Choices grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem' }}>
        {quote.choices.map(speaker => {
          const isCorrect = speaker.id === quote.correctSpeakerId
          const isWrong = wrongIds.has(speaker.id)
          const isDisabled = isWrong || (gameOver && !isCorrect)
          const isHighlighted = (won && isCorrect) || (lost && isCorrect)

          let bg = 'white'
          let border = '2px solid #1a1a1a'
          let shadow = '2px 2px 0 #1a1a1a'
          let opacity = '1'
          if (isWrong) { bg = '#fde8e8'; border = '2px solid #c0392b'; shadow = 'none'; opacity = '0.6' }
          if (isHighlighted) { bg = '#e8f8ee'; border = '2px solid #27ae60'; shadow = '2px 2px 0 #27ae60' }

          return (
            <button
              key={speaker.id}
              onClick={() => guess(speaker.id)}
              disabled={isDisabled}
              style={{
                background: bg, border, borderRadius: '8px', boxShadow: shadow,
                padding: '0.75rem 0.5rem', cursor: isDisabled ? 'default' : 'pointer',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem',
                opacity, transition: 'background 0.15s',
              }}
            >
              <img
                src={speaker.imageUrl}
                alt={speaker.name}
                style={{ width: '3.5rem', height: '3.5rem', borderRadius: '50%', objectFit: 'cover', border: '2px solid #1a1a1a', display: 'block' }}
              />
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#1a1a1a', textAlign: 'center', lineHeight: 1.2 }}>
                {speaker.name}
              </span>
              {isWrong && <span style={{ fontSize: '0.65rem', color: '#c0392b', fontWeight: 700 }}>✗ Wrong</span>}
              {isHighlighted && <span style={{ fontSize: '0.65rem', color: '#27ae60', fontWeight: 700 }}>✓ Correct!</span>}
            </button>
          )
        })}
      </div>

      {/* Win/lose message */}
      {won && (
        <div style={{ background: '#FFFBCC', border: '2px solid #1a1a1a', borderRadius: '8px', padding: '1rem', textAlign: 'center', boxShadow: '3px 3px 0 #1a1a1a' }}>
          <div style={{ fontWeight: 700, fontSize: '1.1rem', marginBottom: '0.75rem' }}>
            {wrongCount === 0 ? 'First try!' : `Got it in ${wrongCount + 1} guess${wrongCount + 1 !== 1 ? 'es' : ''}!`}
          </div>
          <Link href={`/clip/${quote.clipId}`} style={{ display: 'inline-block', padding: '0.4rem 1rem', background: '#FED90F', border: '2px solid #1a1a1a', borderRadius: '6px', fontWeight: 700, textDecoration: 'none', color: '#1a1a1a', boxShadow: '2px 2px 0 #1a1a1a', fontSize: '0.875rem' }}>
            Watch clip →
          </Link>
        </div>
      )}
      {lost && (
        <div style={{ background: 'white', border: '2px solid #c0392b', borderRadius: '8px', padding: '1rem', textAlign: 'center', boxShadow: '3px 3px 0 #c0392b' }}>
          <div style={{ fontWeight: 700, fontSize: '1.1rem', color: '#c0392b', marginBottom: '0.75rem' }}>Out of guesses!</div>
          <Link href={`/clip/${quote.clipId}`} style={{ display: 'inline-block', padding: '0.4rem 1rem', background: '#FED90F', border: '2px solid #1a1a1a', borderRadius: '6px', fontWeight: 700, textDecoration: 'none', color: '#1a1a1a', boxShadow: '2px 2px 0 #1a1a1a', fontSize: '0.875rem' }}>
            Watch clip →
          </Link>
        </div>
      )}

      {/* New quote */}
      <div style={{ textAlign: 'center' }}>
        <button
          onClick={newQuote}
          disabled={loading}
          style={{ padding: '0.5rem 1.5rem', background: '#FED90F', border: '2px solid #1a1a1a', borderRadius: '6px', fontWeight: 700, cursor: loading ? 'default' : 'pointer', boxShadow: '2px 2px 0 #1a1a1a', fontSize: '0.875rem' }}
        >
          {loading ? 'Loading…' : 'New Quote'}
        </button>
      </div>
    </div>
  )
}
