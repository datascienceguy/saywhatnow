'use client'

import { signIn } from 'next-auth/react'

export default function LoginPage() {
  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(180deg, #87CEEB 0%, #B0E0FF 100%)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        background: 'white', border: '3px solid #1a1a1a', borderRadius: '12px',
        boxShadow: '4px 4px 0 #1a1a1a', padding: '2.5rem 2rem', textAlign: 'center',
        maxWidth: '360px', width: '100%',
      }}>
        <h1 style={{ fontFamily: 'var(--font-bangers)', fontSize: '2.5rem', letterSpacing: '0.05em', margin: '0 0 0.25rem', color: '#1a1a1a' }}>
          SayWhatNow
        </h1>
        <p style={{ color: '#888', fontSize: '0.875rem', margin: '0 0 2rem' }}>
          Sign in to continue
        </p>
        <button
          onClick={() => signIn('google', { callbackUrl: '/' })}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem',
            width: '100%', padding: '0.75rem 1rem',
            background: '#FED90F', border: '2px solid #1a1a1a', borderRadius: '8px',
            fontWeight: 700, fontSize: '0.95rem', cursor: 'pointer',
            boxShadow: '3px 3px 0 #1a1a1a',
          }}
          onMouseOver={e => (e.currentTarget.style.background = '#F0C000')}
          onMouseOut={e => (e.currentTarget.style.background = '#FED90F')}
        >
          <GoogleIcon />
          Sign in with Google
        </button>
      </div>
    </div>
  )
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
      <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
      <path d="M3.964 10.706A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.038l3.007-2.332z" fill="#FBBC05"/>
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.962L3.964 7.294C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
    </svg>
  )
}
