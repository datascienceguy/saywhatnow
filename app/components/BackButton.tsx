'use client'

export default function BackButton() {
  return (
    <button
      onClick={() => history.back()}
      style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, color: '#1a1a1a', padding: 0, flexShrink: 0 }}
    >
      ← Back
    </button>
  )
}
