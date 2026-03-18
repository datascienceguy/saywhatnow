'use client'

import { useState } from 'react'
import Link from 'next/link'

interface QuoteData {
  id: number
  text: string
  clipId: number
  speaker: { id: number; name: string; imageUrl: string }
  episode: { season: number; episodeNumber: number; title: string }
}

const MAX_WRONG = 6
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')

// Tile positions: 3 cols × 2 rows = 6 tiles, revealed left-to-right top-to-bottom
const TILES = Array.from({ length: MAX_WRONG }, (_, i) => ({
  col: i % 3,
  row: Math.floor(i / 3),
  w: 100 / 3,
  h: 50,
}))

export default function HangmanGame({ initialQuote }: { initialQuote: QuoteData }) {
  const [quote, setQuote] = useState(initialQuote)
  const [guessed, setGuessed] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)

  const lowerText = quote.text.toLowerCase()
  const uniqueLetters = new Set(lowerText.replace(/[^a-z]/g, '').split(''))
  const wrongLetters = [...guessed].filter(l => !uniqueLetters.has(l))
  const wrongCount = wrongLetters.length
  const won = [...uniqueLetters].every(l => guessed.has(l))
  const lost = wrongCount >= MAX_WRONG
  const gameOver = won || lost

  function guess(letter: string) {
    if (gameOver || guessed.has(letter)) return
    setGuessed(prev => new Set([...prev, letter]))
  }

  async function newQuote() {
    setLoading(true)
    try {
      const res = await fetch('/api/games/hangman')
      const data = await res.json()
      setQuote(data)
      setGuessed(new Set())
    } finally {
      setLoading(false)
    }
  }

  const displayText = quote.text
    .split('')
    .map(char => {
      if (!/[a-zA-Z]/.test(char)) return char
      return guessed.has(char.toLowerCase()) || gameOver ? char : '_'
    })
    .join('')

  return (
    <div style={{ maxWidth: '580px', margin: '2rem auto', padding: '0 1rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

      {/* Speaker image with tile overlay */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
        <div style={{
          position: 'relative', width: '150px', height: '150px',
          borderRadius: '50%', overflow: 'hidden',
          border: '3px solid #1a1a1a', boxShadow: '3px 3px 0 #1a1a1a',
        }}>
          <img
            src={quote.speaker.imageUrl}
            alt="???"
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
          {TILES.map((tile, i) => {
            if (i < wrongCount) return null
            return (
              <div
                key={i}
                style={{
                  position: 'absolute',
                  left: `${tile.col * tile.w}%`,
                  top: `${tile.row * tile.h}%`,
                  width: `${tile.w}%`,
                  height: `${tile.h}%`,
                  background: '#FED90F',
                  borderRight: '1px solid rgba(0,0,0,0.15)',
                  borderBottom: '1px solid rgba(0,0,0,0.15)',
                }}
              />
            )
          })}
        </div>
        <div style={{ fontFamily: 'var(--font-bangers)', fontSize: '1.25rem', letterSpacing: '0.05em', color: '#1a1a1a' }}>
          {gameOver ? quote.speaker.name : '???'}
        </div>
        <div style={{ fontSize: '0.75rem', color: '#555' }}>
          {wrongCount} / {MAX_WRONG} wrong guesses
        </div>
      </div>

      {/* Quote display */}
      <div style={{ background: 'white', border: '2px solid #1a1a1a', borderRadius: '8px', padding: '1.25rem', boxShadow: '3px 3px 0 #1a1a1a', textAlign: 'center' }}>
        <p style={{ margin: 0, fontFamily: 'monospace', fontSize: '1.25rem', letterSpacing: '0.25em', wordBreak: 'break-word', lineHeight: 1.8, color: '#1a1a1a' }}>
          {displayText}
        </p>
        {gameOver && (
          <p style={{ margin: '0.5rem 0 0', fontSize: '0.75rem', color: '#888' }}>
            S{quote.episode.season}E{quote.episode.episodeNumber} &mdash; {quote.episode.title}
          </p>
        )}
      </div>

      {/* Win/lose message */}
      {won && (
        <div style={{ background: '#FFFBCC', border: '2px solid #1a1a1a', borderRadius: '8px', padding: '1rem', textAlign: 'center', boxShadow: '3px 3px 0 #1a1a1a' }}>
          <div style={{ fontWeight: 700, fontSize: '1.1rem', marginBottom: '0.75rem' }}>You got it! 🎉</div>
          <Link href={`/clip/${quote.clipId}`} style={{ display: 'inline-block', padding: '0.4rem 1rem', background: '#FED90F', border: '2px solid #1a1a1a', borderRadius: '6px', fontWeight: 700, textDecoration: 'none', color: '#1a1a1a', boxShadow: '2px 2px 0 #1a1a1a', fontSize: '0.875rem' }}>
            Watch clip →
          </Link>
        </div>
      )}
      {lost && (
        <div style={{ background: 'white', border: '2px solid #c0392b', borderRadius: '8px', padding: '1rem', textAlign: 'center', boxShadow: '3px 3px 0 #c0392b' }}>
          <div style={{ fontWeight: 700, fontSize: '1.1rem', color: '#c0392b', marginBottom: '0.75rem' }}>Game over!</div>
          <Link href={`/clip/${quote.clipId}`} style={{ display: 'inline-block', padding: '0.4rem 1rem', background: '#FED90F', border: '2px solid #1a1a1a', borderRadius: '6px', fontWeight: 700, textDecoration: 'none', color: '#1a1a1a', boxShadow: '2px 2px 0 #1a1a1a', fontSize: '0.875rem' }}>
            Watch clip →
          </Link>
        </div>
      )}

      {/* Keyboard */}
      <div style={{ background: 'white', border: '2px solid #1a1a1a', borderRadius: '8px', padding: '1rem', boxShadow: '3px 3px 0 #1a1a1a' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem', justifyContent: 'center' }}>
          {LETTERS.map(letter => {
            const lower = letter.toLowerCase()
            const isGuessed = guessed.has(lower)
            const isWrong = isGuessed && !uniqueLetters.has(lower)
            const isCorrect = isGuessed && uniqueLetters.has(lower)
            return (
              <button
                key={letter}
                onClick={() => guess(lower)}
                disabled={isGuessed || gameOver}
                style={{
                  width: '2.1rem', height: '2.1rem',
                  border: '2px solid #1a1a1a', borderRadius: '4px',
                  fontWeight: 700, fontSize: '0.8rem',
                  cursor: isGuessed || gameOver ? 'default' : 'pointer',
                  background: isWrong ? '#e74c3c' : isCorrect ? '#27ae60' : '#FED90F',
                  color: isWrong || isCorrect ? 'white' : '#1a1a1a',
                  opacity: isGuessed ? 0.55 : 1,
                  boxShadow: isGuessed ? 'none' : '2px 2px 0 #1a1a1a',
                }}
              >
                {letter}
              </button>
            )
          })}
        </div>
      </div>

      {/* New quote button */}
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
