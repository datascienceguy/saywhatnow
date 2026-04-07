'use client'

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { toTitleCase } from '@/lib/display'

interface Speaker {
  id: number
  name: string
  words: number
  quotes: number
}

interface Props {
  speakers: Speaker[]
  totalWords: number
}

const COLORS = [
  '#FED90F', '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4',
  '#DDA0DD', '#F7DC6F', '#82E0AA', '#F0B27A', '#AED6F1',
]

function CustomTooltip({ active, payload }: { active?: boolean; payload?: { payload: Speaker & { pct: number } }[] }) {
  if (!active || !payload?.length) return null
  const sp = payload[0].payload
  return (
    <div style={{ background: 'white', border: '2px solid #1a1a1a', borderRadius: '6px', padding: '0.5rem 0.75rem', boxShadow: '2px 2px 0 #1a1a1a', fontSize: '0.8rem' }}>
      <div style={{ fontWeight: 700 }}>{toTitleCase(sp.name)}</div>
      <div style={{ color: '#555' }}>{sp.pct}% of words</div>
      <div style={{ color: '#888' }}>{sp.words.toLocaleString()} words · {sp.quotes} lines</div>
    </div>
  )
}

export default function SpeakerDonut({ speakers, totalWords }: Props) {
  const data = speakers.map(sp => ({
    ...sp,
    pct: totalWords ? Math.round((sp.words / totalWords) * 100) : 0,
  }))

  return (
    <ResponsiveContainer width="100%" height={300}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius={70}
          outerRadius={110}
          dataKey="words"
          nameKey="name"
          paddingAngle={2}
        >
          {data.map((_, i) => (
            <Cell key={i} fill={COLORS[i % COLORS.length]} stroke="#1a1a1a" strokeWidth={1} />
          ))}
        </Pie>
        <Tooltip content={<CustomTooltip />} />
        <Legend
          formatter={(value) => toTitleCase(value)}
          iconType="circle"
          iconSize={8}
          wrapperStyle={{ fontSize: '0.75rem' }}
        />
      </PieChart>
    </ResponsiveContainer>
  )
}
