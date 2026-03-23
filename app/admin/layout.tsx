import Link from 'next/link'

export const metadata = { title: 'Admin — SayWhatNow' }

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <header className="border-b border-gray-800 bg-gray-900 px-6 py-3 flex items-center gap-6">
        <span className="font-bold text-yellow-400 tracking-wide">SWN Admin</span>
        <nav className="flex gap-4 text-sm text-gray-400">
          <Link href="/admin/staging" className="hover:text-white transition-colors">
            Episode Imports
          </Link>
          <Link href="/" className="hover:text-white transition-colors">
            ← Back to site
          </Link>
        </nav>
      </header>
      <main className="p-6">{children}</main>
    </div>
  )
}
