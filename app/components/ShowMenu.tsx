'use client'

import { useState } from 'react'
import Link from 'next/link'

const SHOW_ROUTES: Record<string, { path: string; emoji: string; label: string; order: number }> = {
  SIMPSONS: { path: '/',       emoji: '🍩', label: 'The Simpsons', order: 0 },
  OFFICE:   { path: '/office', emoji: '📎', label: 'The Office',   order: 1 },
  SCRUBS:   { path: '/scrubs', emoji: '🩺', label: 'Scrubs',       order: 2 },
}

function showKey(name: string) {
  const upper = name.toUpperCase()
  for (const key of Object.keys(SHOW_ROUTES)) {
    if (upper.includes(key)) return key
  }
  return null
}

export default function ShowMenu({ shows }: { shows: { name: string }[] }) {
  const [open, setOpen] = useState(false)

  const items = shows
    .map(s => ({ ...s, key: showKey(s.name) }))
    .filter(s => s.key)
    .map(s => ({ ...s, ...SHOW_ROUTES[s.key!] }))
    .sort((a, b) => a.order - b.order)

  if (items.length < 2) return null

  return (
    <div style={{ position: 'relative' }} onMouseLeave={() => setOpen(false)}>
      <button
        onMouseEnter={() => setOpen(true)}
        onClick={() => setOpen(o => !o)}
        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, color: '#1a1a1a', padding: 0 }}
      >
        📺 Shows ▾
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0,
          background: 'white', border: '2px solid #1a1a1a', borderRadius: '6px',
          boxShadow: '2px 2px 0 #1a1a1a', zIndex: 100, minWidth: '10rem',
        }}>
          {items.map((item, i) => (
            <Link
              key={item.key}
              href={item.path}
              onClick={() => setOpen(false)}
              style={{
                display: 'block', padding: '0.5rem 1rem',
                textDecoration: 'none', color: '#1a1a1a',
                fontSize: '0.875rem', fontWeight: 600,
                borderTop: i > 0 ? '1px solid #e5e5e5' : undefined,
              }}
            >
              {item.emoji} {item.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
