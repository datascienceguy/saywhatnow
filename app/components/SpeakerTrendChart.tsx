'use client'

import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from 'recharts'
import { toTitleCase } from '@/lib/display'

interface Props {
  seasons: number[]
  speakers: Array<{ id: number; name: string }>
  data: Array<{ season: number; speakerId: number; words: number }>
}

const COLORS = [
  '#FED90F', '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4',
  '#DDA0DD', '#F7DC6F', '#82E0AA', '#F0B27A', '#AED6F1',
]

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: number }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: 'white', border: '2px solid #1a1a1a', borderRadius: '6px', padding: '0.5rem 0.75rem', boxShadow: '2px 2px 0 #1a1a1a', fontSize: '0.8rem' }}>
      <div style={{ fontWeight: 700, marginBottom: '0.25rem' }}>Season {label}</div>
      {[...payload].sort((a, b) => b.value - a.value).map(p => (
        <div key={p.name} style={{ color: '#555', display: 'flex', justifyContent: 'space-between', gap: '1rem' }}>
          <span style={{ color: p.color, fontWeight: 600 }}>{p.name}</span>
          <span>{p.value.toFixed(1)}%</span>
        </div>
      ))}
    </div>
  )
}

export default function SpeakerTrendChart({ seasons, speakers, data }: Props) {
  // Build season totals
  const seasonTotals = new Map<number, number>()
  for (const d of data) {
    seasonTotals.set(d.season, (seasonTotals.get(d.season) ?? 0) + d.words)
  }

  // Build chart data: one row per season
  const chartData = seasons.map(season => {
    const total = seasonTotals.get(season) ?? 1
    const row: Record<string, number | string> = { season }
    for (const sp of speakers) {
      const words = data.find(d => d.season === season && d.speakerId === sp.id)?.words ?? 0
      row[toTitleCase(sp.name)] = Math.round((words / total) * 1000) / 10
    }
    return row
  })

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis dataKey="season" tickFormatter={s => `S${s}`} tick={{ fontSize: 12 }} />
        <YAxis tickFormatter={v => `${v}%`} tick={{ fontSize: 11 }} width={38} />
        <Tooltip content={<CustomTooltip />} />
        <Legend formatter={v => v} iconType="circle" iconSize={8} wrapperStyle={{ fontSize: '0.75rem' }} />
        {speakers.map((sp, i) => (
          <Line
            key={sp.id}
            type="monotone"
            dataKey={toTitleCase(sp.name)}
            stroke={COLORS[i % COLORS.length]}
            strokeWidth={2}
            dot={{ r: 3 }}
            activeDot={{ r: 5 }}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  )
}
