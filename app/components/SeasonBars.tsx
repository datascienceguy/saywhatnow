'use client'

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'

interface Props {
  seasonCounts: Record<number, number>
  mostActiveSeason: number
}

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: number }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: 'white', border: '2px solid #1a1a1a', borderRadius: '6px', padding: '0.4rem 0.75rem', boxShadow: '2px 2px 0 #1a1a1a', fontSize: '0.8rem' }}>
      <div style={{ fontWeight: 700 }}>Season {label}</div>
      <div style={{ color: '#555' }}>{payload[0].value.toLocaleString()} words</div>
    </div>
  )
}

export default function SeasonBars({ seasonCounts, mostActiveSeason }: Props) {
  const data = Object.entries(seasonCounts)
    .map(([season, count]) => ({ season: Number(season), count }))
    .sort((a, b) => a.season - b.season)

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
        <XAxis
          dataKey="season"
          tickFormatter={s => `S${s}`}
          tick={{ fontSize: 11, fill: '#888' }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fontSize: 11, fill: '#888' }}
          axisLine={false}
          tickLine={false}
          allowDecimals={false}
        />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: '#f5f5f5' }} />
        <Bar dataKey="count" radius={[3, 3, 0, 0]}>
          {data.map(d => (
            <Cell
              key={d.season}
              fill={d.season === mostActiveSeason ? '#FED90F' : '#d0d0d0'}
              stroke={d.season === mostActiveSeason ? '#1a1a1a' : 'none'}
              strokeWidth={1}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
