'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const path = usePathname()

  const navItem = (href: string, label: string) => {
    const active = path === href || path.startsWith(href + '/')
    return (
      <Link
        href={href}
        className={`block px-3 py-1.5 rounded text-sm transition-colors ${active ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800'}`}
      >
        {label}
      </Link>
    )
  }

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 flex">
      {/* Sidebar */}
      <aside className="w-48 shrink-0 bg-gray-900 border-r border-gray-800 flex flex-col">
        <div className="px-4 py-4 border-b border-gray-800">
          <span className="font-bold text-yellow-400 tracking-wide text-sm">SWN Admin</span>
        </div>
        <nav className="flex-1 px-2 py-4 space-y-4">
          <div>
            <p className="px-3 mb-1 text-xs font-semibold uppercase tracking-wider text-gray-600">Content</p>
            {navItem('/admin/staging', 'Episode Imports')}
          </div>
          <div>
            <p className="px-3 mb-1 text-xs font-semibold uppercase tracking-wider text-gray-600">People</p>
            {navItem('/admin/speakers', 'Speakers')}
          </div>
          <div>
            <p className="px-3 mb-1 text-xs font-semibold uppercase tracking-wider text-gray-600">Settings</p>
            {navItem('/admin/users', 'Users')}
          </div>
        </nav>
        <div className="px-2 py-4 border-t border-gray-800">
          <Link href="/" className="block px-3 py-1.5 rounded text-sm text-gray-500 hover:text-white hover:bg-gray-800 transition-colors">
            ← Back to site
          </Link>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-auto p-6">{children}</main>
    </div>
  )
}
