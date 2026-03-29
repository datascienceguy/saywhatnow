'use client'

import { useState } from 'react'

type User = {
  id: number
  username: string
  email: string
  role: string
  createdAt: Date | string
}

export default function UsersManager({ users: initial, currentEmail }: { users: User[]; currentEmail: string }) {
  const [users, setUsers] = useState<User[]>(initial)
  const [error, setError] = useState('')

  async function updateRole(id: number, role: string) {
    setError('')
    const res = await fetch(`/api/admin/users/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role }),
    })
    if (!res.ok) { setError((await res.json()).error); return }
    const updated = await res.json()
    setUsers(prev => prev.map(u => u.id === id ? updated : u))
  }

  async function deleteUser(id: number, email: string) {
    if (!confirm(`Delete user ${email}? This cannot be undone.`)) return
    setError('')
    const res = await fetch(`/api/admin/users/${id}`, { method: 'DELETE' })
    if (!res.ok) { setError((await res.json()).error); return }
    setUsers(prev => prev.filter(u => u.id !== id))
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-white">Users</h1>
        <span className="text-sm text-gray-500">{users.length} users</span>
      </div>

      {error && <p className="mb-4 text-sm text-red-400">{error}</p>}

      <div className="rounded-lg border border-gray-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800 bg-gray-900">
              <th className="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-gray-500">User</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-gray-500">Email</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-gray-500">Role</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-gray-500">Joined</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {users.map(u => {
              const isSelf = u.email === currentEmail
              return (
                <tr key={u.id} className="border-b border-gray-800 last:border-0 hover:bg-gray-900 transition-colors">
                  <td className="px-4 py-3 text-white">
                    {u.username}
                    {isSelf && <span className="ml-1.5 text-xs text-gray-600">(you)</span>}
                  </td>
                  <td className="px-4 py-3 text-gray-400">{u.email}</td>
                  <td className="px-4 py-3">
                    <select
                      value={u.role}
                      onChange={e => updateRole(u.id, e.target.value)}
                      className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-300 focus:outline-none focus:border-yellow-400"
                    >
                      <option value="GUEST">GUEST</option>
                      <option value="ADMIN">ADMIN</option>
                    </select>
                  </td>
                  <td className="px-4 py-3 text-gray-600 text-xs">
                    {new Date(u.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {!isSelf && (
                      <button
                        onClick={() => deleteUser(u.id, u.email)}
                        className="text-xs text-gray-600 hover:text-red-400 transition-colors px-2 py-1 rounded hover:bg-gray-800"
                      >
                        Delete
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-xs text-gray-600">
        New users are created automatically on first Google sign-in (if allowed by the email allowlist).
      </p>
    </div>
  )
}
