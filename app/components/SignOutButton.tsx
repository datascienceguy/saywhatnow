'use client'

import { signOut } from 'next-auth/react'

interface Props {
  name?: string | null
  image?: string | null
}

export default function SignOutButton({ name, image }: Props) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
      {image && (
        <img src={image} alt={name ?? ''} style={{ width: '1.6rem', height: '1.6rem', borderRadius: '50%', border: '2px solid #1a1a1a' }} />
      )}
      <button
        onClick={() => signOut({ callbackUrl: '/login' })}
        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, color: '#1a1a1a', padding: 0 }}
      >
        Sign out
      </button>
    </div>
  )
}
