'use client'

interface Props {
  href: string
  children: React.ReactNode
}

export default function ClickableCard({ href, children }: Props) {
  return (
    <div
      onClick={() => window.location.href = href}
      style={{ border: '2px solid #1a1a1a', borderRadius: '8px', overflow: 'hidden', boxShadow: '3px 3px 0 #1a1a1a', background: 'white', cursor: 'pointer' }}
    >
      {children}
    </div>
  )
}
