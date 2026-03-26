import Link from 'next/link'
import Image from 'next/image'
import GamesMenu from './GamesMenu'
import SignOutButton from './SignOutButton'
import BackButton from './BackButton'

interface Props {
  userName?: string | null
  userImage?: string | null
  isAdmin?: boolean
  back?: boolean
  subtitle?: React.ReactNode
}

export default function SiteHeader({ userName, userImage, isAdmin, back, subtitle }: Props) {
  return (
    <header style={{ background: '#FED90F', borderBottom: '3px solid #1a1a1a' }}>
      {/* Brand row */}
      <div style={{ padding: '0.6rem 1.5rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <Link href="/" style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
          <Image src="/pictures/saywhatnow.jpg" alt="SayWhatNow" width={120} height={40} style={{ objectFit: 'contain', display: 'block', mixBlendMode: 'multiply' }} />
        </Link>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.75rem', flexShrink: 0 }}>
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
      </div>

      {/* Subtitle row */}
      {subtitle && (
        <div style={{ borderTop: '1px solid rgba(0,0,0,0.12)', padding: '0.35rem 1.5rem', display: 'flex', alignItems: 'center', gap: '0.6rem', background: 'rgba(0,0,0,0.04)' }}>
          {back && <BackButton />}
          <span style={{ fontSize: '0.875rem', color: '#3a2800', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {subtitle}
          </span>
        </div>
      )}
    </header>
  )
}
