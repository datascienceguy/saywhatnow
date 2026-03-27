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
    <header style={{ background: '#FED90F', borderBottom: '3px solid #1a1a1a', padding: '0.4rem 1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
      {back && <BackButton />}
      <Link href="/" style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
        <Image src="/pictures/saywhatnow.jpg" alt="SayWhatNow" width={80} height={28} style={{ objectFit: 'contain', display: 'block', mixBlendMode: 'multiply' }} />
      </Link>
      {subtitle && (
        <>
          <span style={{ color: '#a07800', fontSize: '0.85rem' }}>›</span>
          <span style={{ fontSize: '0.85rem', color: '#3a2800', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
            {subtitle}
          </span>
        </>
      )}
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
    </header>
  )
}
