import Link from 'next/link'
import Image from 'next/image'
import GamesMenu from './GamesMenu'
import ShowsMenu from './ShowsMenu'
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

export default async function SiteHeader({ userName, userImage, isAdmin, back, subtitle }: Props) {
  const shows = await prisma.show.findMany({ orderBy: { name: 'asc' } })

  return (
    <header className="site-header">
      {back && <BackButton />}
      <Link href="/" style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
        <Image src="/pictures/saywhatnow.jpg" alt="SayWhatNow" width={80} height={28} style={{ objectFit: 'contain', display: 'block', mixBlendMode: 'multiply' }} />
      </Link>
      {subtitle && (
        <div className="site-header-subtitle">
          <span className="chevron" style={{ color: '#a07800', fontSize: '0.85rem', flexShrink: 0 }}>›</span>
          <span style={{ fontSize: '0.85rem', color: '#3a2800' }}>{subtitle}</span>
        </div>
      )}
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.75rem', flexShrink: 0 }}>
        <Link href="/random" style={{ fontSize: '0.8rem', fontWeight: 600, color: '#3a2800', textDecoration: 'none', flexShrink: 0 }}>
          Random
        </Link>
        <ShowsMenu shows={shows} />
        <GamesMenu />
        {isAdmin && (
          <Link
            href="/admin/staging"
            style={{ fontSize: '0.8rem', fontWeight: 600, background: '#1a1a1a', color: '#FED90F', padding: '0.2rem 0.6rem', borderRadius: '4px', textDecoration: 'none' }}
          >
            Admin
          </Link>
        )}
        <SignOutButton name={userName} image={userImage} />
      </div>
    </header>
  )
}
