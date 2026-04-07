'use client'

import { useState } from 'react'
import Link from 'next/link'

export default function GamesMenu() {
  const [open, setOpen] = useState(false)

  return (
    <div style={{ position: 'relative' }} onMouseLeave={() => setOpen(false)}>
      <button
        onMouseEnter={() => setOpen(true)}
        onClick={() => setOpen(o => !o)}
        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, color: '#1a1a1a', padding: 0 }}
      >
        🎮 Games ▾
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0,
          background: 'white', border: '2px solid #1a1a1a', borderRadius: '6px',
          boxShadow: '2px 2px 0 #1a1a1a', zIndex: 100, minWidth: '9rem',
        }}>
          <Link href="/games/hangman" onClick={() => setOpen(false)}
            style={{ display: 'block', padding: '0.5rem 1rem', textDecoration: 'none', color: '#1a1a1a', fontSize: '0.875rem', fontWeight: 600 }}>
            Hangman
          </Link>
          <Link href="/games/match-quote" onClick={() => setOpen(false)}
            style={{ display: 'block', padding: '0.5rem 1rem', textDecoration: 'none', color: '#1a1a1a', fontSize: '0.875rem', fontWeight: 600, borderTop: '1px solid #e5e5e5' }}>
            Match the Quote
          </Link>
        </div>
      )}
    </div>
  )
}
