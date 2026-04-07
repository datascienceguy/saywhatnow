import Link from 'next/link'
import Image from 'next/image'
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
      <Link href="/" style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
        <Image src="/pictures/saywhatnow.jpg" alt="SayWhatNow" width={80} height={28} style={{ objectFit: 'contain', display: 'block', mixBlendMode: 'multiply' }} />
      </Link>
      {subtitle && (
        <div className="site-header-subtitle">
          <span className="chevron" style={{ color: '#888', fontSize: '0.85rem', flexShrink: 0 }}>›</span>
          <span style={{ fontSize: '1rem', color: '#1a1a1a', fontFamily: 'var(--font-bangers)', letterSpacing: '0.03em' }}>{subtitle}</span>
        </div>
      )}
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '1rem', flexShrink: 0 }}>
        <Link href="/random" style={navLink}>Random clip</Link>
        {simpsonsShow && (
          <Link href={`/show/${simpsonsShow.id}`} style={navLink}>Browse episodes</Link>
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
