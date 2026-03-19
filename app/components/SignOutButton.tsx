'use client'

import { signOut } from 'next-auth/react'

interface Props {
  name?: string | null
  image?: string | null
}

export default function SignOutButton({ name, image }: Props) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginLeft: 'auto' }}>
      {image && (
        <img src={image} alt={name ?? ''} style={{ width: '1.75rem', height: '1.75rem', borderRadius: '50%', border: '2px solid #1a1a1a' }} />
      )}
      <button
        onClick={() => signOut({ callbackUrl: '/login' })}
        style={{ background: 'none', border: '1px solid #1a1a1a', borderRadius: '4px', padding: '0.2rem 0.6rem', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', color: '#1a1a1a' }}
      >
        Sign out
      </button>
    </div>
  )
}
