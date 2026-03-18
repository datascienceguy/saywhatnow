'use client'

export default function BackButton() {
  return (
    <button
      onClick={() => history.back()}
      style={{ fontWeight: 700, fontSize: '0.875rem', color: '#1a1a1a', background: 'white', border: '2px solid #1a1a1a', padding: '0.2rem 0.6rem', borderRadius: '4px', boxShadow: '2px 2px 0 #1a1a1a', cursor: 'pointer' }}
    >
      ← Back
    </button>
  )
}
