'use client'

import { useEffect, useRef } from 'react'

interface Quote {
  id: number
  text: string
  sequence: number
  speaker: { name: string; imageUrl: string | null } | null
}

interface Props {
  src: string
  startTime: string
  stopTime: string
  quotes: Quote[]
  matchQ?: string
}

function parseSrtTime(t: string): number {
  const [hms, ms] = t.split(',')
  const [h, m, s] = hms.split(':').map(Number)
  return h * 3600 + m * 60 + s + Number(ms) / 1000
}

export default function ClipViewer({ src, startTime, stopTime, quotes, matchQ }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    return () => { videoRef.current?.pause() }
  }, [])

  const clipDuration = parseSrtTime(stopTime) - parseSrtTime(startTime)
  const lowerQ = matchQ?.toLowerCase() ?? ''

  function seekTo(index: number) {
    if (!videoRef.current) return
    const offset = quotes.length > 1
      ? (index / (quotes.length - 1)) * clipDuration
      : 0
    videoRef.current.currentTime = Math.max(0, offset)
    videoRef.current.play()
  }

  return (
    <>
      <div style={{ border: '2px solid #1a1a1a', borderRadius: '8px', overflow: 'hidden', boxShadow: '3px 3px 0 #1a1a1a', background: '#000', display: 'flex', justifyContent: 'center', marginBottom: '1rem' }}>
        <video ref={videoRef} controls autoPlay style={{ display: 'block', maxWidth: '100%' }}>
          <source src={src} type="video/mp4" />
        </video>
      </div>

      <div style={{ border: '2px solid #1a1a1a', borderRadius: '8px', overflow: 'hidden', boxShadow: '3px 3px 0 #1a1a1a', background: 'white' }}>
        {quotes.map((quote, i) => {
          const isMatch = lowerQ && quote.text.toLowerCase().includes(lowerQ)
          return (
            <div
              key={quote.id}
              onClick={() => seekTo(i)}
              style={{
                padding: '0.4rem 1rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                fontSize: '0.875rem',
                background: isMatch ? '#FFFBCC' : i % 2 === 0 ? '#fff' : '#fafafa',
                borderTop: i > 0 ? '1px solid #e5e5e5' : undefined,
                cursor: 'pointer',
              }}
              title="Click to seek to this line"
            >
              {quote.speaker?.imageUrl ? (
                <img
                  src={quote.speaker.imageUrl}
                  alt={quote.speaker.name}
                  style={{ width: '2.5rem', height: '2.5rem', objectFit: 'cover', borderRadius: '50%', border: '2px solid #1a1a1a', flexShrink: 0 }}
                />
              ) : (
                <img src="/default-avatar.svg" alt="Unknown speaker" style={{ width: '2.5rem', height: '2.5rem', objectFit: 'cover', borderRadius: '50%', border: '2px solid #ccc', flexShrink: 0 }} />
              )}
              <span style={{ color: '#888', flexShrink: 0, width: '9rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: isMatch ? 700 : 400, fontSize: '0.75rem' }}>
                {quote.speaker?.name ?? 'UNKNOWN'}
              </span>
              <span style={{ fontWeight: isMatch ? 600 : 400, color: isMatch ? '#1a1a1a' : '#444' }}>
                {quote.text}
              </span>
            </div>
          )
        })}
      </div>
    </>
  )
}
