'use client'

import { useRouter, useSearchParams } from 'next/navigation'

const OPTIONS = [10, 25, 50, 100]

export default function PageSizeSelector({ current }: { current: number }) {
  const router = useRouter()
  const params = useSearchParams()

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = new URLSearchParams(params.toString())
    next.set('limit', e.target.value)
    next.delete('page')
    router.push(`/?${next.toString()}`)
  }

  return (
    <select
      value={current}
      onChange={onChange}
      style={{ border: '2px solid #1a1a1a', borderRadius: '6px', padding: '0.2rem 0.4rem', background: 'white', fontSize: '0.8rem', cursor: 'pointer' }}
    >
      {OPTIONS.map(n => (
        <option key={n} value={n}>{n} per page</option>
      ))}
    </select>
  )
}
