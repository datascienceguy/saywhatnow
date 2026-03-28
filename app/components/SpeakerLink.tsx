'use client'

import { toTitleCase } from '@/lib/display'

interface Props {
  id: number | null
  name: string | null
  imageUrl: string | null
  imagePosition?: string | null
  isMatch?: boolean
  compact?: boolean
}

export default function SpeakerLink({ id, name, imageUrl, imagePosition, isMatch, compact }: Props) {
  function handleClick(e: React.MouseEvent) {
    e.stopPropagation()
    e.nativeEvent.stopImmediatePropagation()
    if (id) window.location.href = `/speaker/${id}`
  }

  const size = compact ? '1.75rem' : '2.5rem'

  const img = imageUrl
    ? <img src={imageUrl} alt={name ?? ''} style={{ width: size, height: size, objectFit: 'cover', objectPosition: imagePosition ?? 'center center', borderRadius: '50%', border: compact ? '1.5px solid #d0d0d0' : '2px solid #1a1a1a', flexShrink: 0, display: 'block' }} />
    : <img src="/default-avatar.svg" alt="Unknown speaker" style={{ width: size, height: size, objectFit: 'cover', borderRadius: '50%', border: compact ? '1.5px solid #d0d0d0' : '2px solid #ccc', flexShrink: 0, display: 'block' }} />

  const nameEl = compact ? (
    <span style={{ color: isMatch ? '#555' : '#999', flexShrink: 0, width: '6rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: isMatch ? 600 : 400, fontSize: '0.7rem', display: 'block' }}>
      {toTitleCase(name) || 'Unknown'}
    </span>
  ) : (
    <span style={{ color: '#888', flexShrink: 0, width: '9rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: isMatch ? 700 : 400, fontSize: '0.75rem', display: 'block' }}>
      {toTitleCase(name) || 'Unknown'}
    </span>
  )

  return (
    <div
      onClick={id ? handleClick : undefined}
      style={{ display: 'inline-flex', alignItems: 'center', gap: compact ? '0.35rem' : '0.5rem', flexShrink: 0, cursor: id ? 'pointer' : 'default' }}
    >
      {img}
      {nameEl}
    </div>
  )
}
