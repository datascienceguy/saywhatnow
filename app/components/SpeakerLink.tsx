'use client'

interface Props {
  id: number | null
  name: string | null
  imageUrl: string | null
  isMatch?: boolean
}

export default function SpeakerLink({ id, name, imageUrl, isMatch }: Props) {
  function handleClick(e: React.MouseEvent) {
    e.stopPropagation()
    if (id) window.location.href = `/speaker/${id}`
  }

  const img = imageUrl
    ? <img src={imageUrl} alt={name ?? ''} style={{ width: '2.5rem', height: '2.5rem', objectFit: 'cover', borderRadius: '50%', border: '2px solid #1a1a1a', flexShrink: 0, display: 'block' }} />
    : <img src="/default-avatar.svg" alt="Unknown speaker" style={{ width: '2.5rem', height: '2.5rem', objectFit: 'cover', borderRadius: '50%', border: '2px solid #ccc', flexShrink: 0, display: 'block' }} />

  const nameEl = (
    <span style={{ color: '#888', flexShrink: 0, width: '9rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: isMatch ? 700 : 400, fontSize: '0.75rem', display: 'block' }}>
      {name ?? 'UNKNOWN'}
    </span>
  )

  return (
    <div
      onClick={id ? handleClick : undefined}
      style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0, cursor: id ? 'pointer' : 'default' }}
    >
      {img}
      {nameEl}
    </div>
  )
}
