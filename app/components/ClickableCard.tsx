'use client'

import { useState } from 'react'

interface Props {
  href: string
  children: React.ReactNode
}

export default function ClickableCard({ href, children }: Props) {
  const [hovered, setHovered] = useState(false)
  return (
    <div
      onClick={() => window.location.href = href}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        border: '1px solid #e0e0e0',
        borderRadius: '10px',
        overflow: 'hidden',
        background: 'white',
        cursor: 'pointer',
        boxShadow: hovered ? '0 4px 16px rgba(0,0,0,0.10)' : '0 1px 4px rgba(0,0,0,0.07)',
        transform: hovered ? 'translateY(-1px)' : 'none',
        transition: 'box-shadow 0.15s ease, transform 0.15s ease',
      }}
    >
      {children}
    </div>
  )
}
