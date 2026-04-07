import Link from 'next/link'
import GamesMenu from './GamesMenu'
import SignOutButton from './SignOutButton'
import BackButton from './BackButton'
import prisma from '@/lib/prisma'

interface Props {
  userName?: string | null
  userImage?: string | null
  isAdmin?: boolean
  back?: boolean
  subtitle?: React.ReactNode
}

const navLink = { fontSize: '0.8rem', fontWeight: 600, color: '#1a1a1a', textDecoration: 'none', flexShrink: 0 } as const

export default async function SiteHeader({ userName, userImage, isAdmin, back, subtitle }: Props) {
  const simpsonsShow = await prisma.show.findFirst({ where: { name: { contains: 'SIMPSONS' } } })

  return (
    <header className="site-header">
      {back && <BackButton />}
      <Link href="/" className="logo-bubble" style={{
        position: 'relative', display: 'inline-block',
        background: 'white', border: '2px solid #1a1a1a', borderRadius: '10px',
        padding: '0.15rem 0.6rem 0.1rem', fontFamily: 'var(--font-bangers)',
        fontSize: '1.3rem', color: '#1a1a1a', letterSpacing: '0.04em',
        lineHeight: 1, whiteSpace: 'nowrap', boxShadow: '2px 2px 0 #1a1a1a',
        textDecoration: 'none',
      }}>SayWhatNow</Link>
      {subtitle && (
        <div className="site-header-subtitle">
          <span className="chevron" style={{ color: '#888', fontSize: '0.85rem', flexShrink: 0 }}>›</span>
          <span style={{ fontSize: '1.3rem', color: '#1a1a1a', fontFamily: 'var(--font-bangers)', letterSpacing: '0.03em' }}>{subtitle}</span>
        </div>
      )}
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '1rem', flexShrink: 0 }}>
        <Link href="/random" style={navLink}>🎲 Random</Link>
        {simpsonsShow && (
          <Link href={`/show/${simpsonsShow.id}`} style={navLink}>📺 Episodes</Link>
        )}
        <GamesMenu />
        {isAdmin && (
          <Link href="/admin/staging" style={{ ...navLink, background: '#1a1a1a', color: '#FED90F', padding: '0.2rem 0.6rem', borderRadius: '4px' }}>
            Admin
          </Link>
        )}
        <SignOutButton name={userName} image={userImage} />
      </div>
    </header>
  )
}
