'use client'

import { useEffect, useRef } from 'react'
import SpeakerLink from './SpeakerLink'

interface Quote {
  id: number
  text: string
  sequence: number
  speaker: { id: number; name: string; imageUrl: string | null; imagePosition: string | null } | null
}

interface Props {
  src: string
  startTime: string
  stopTime: string
  quotes: Quote[]
  matchQ?: string
}

function parseTime(t: string): number {
  // Plain seconds (e.g. "83.5") or SRT format (e.g. "00:01:23,456")
  if (!t.includes(':')) return parseFloat(t) || 0
  const [hms, ms] = t.split(',')
  const [h, m, s] = hms.split(':').map(Number)
  return h * 3600 + m * 60 + s + Number(ms) / 1000
}

export default function ClipViewer({ src, startTime, stopTime, quotes, matchQ }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    return () => { videoRef.current?.pause() }
  }, [])

  const clipDuration = parseTime(stopTime) - parseTime(startTime)
  const lowerQ = matchQ?.toLowerCase() ?? ''

  function seekTo(index: number) {
    if (!videoRef.current) return
    const offset = quotes.length > 1
      ? (index / (quotes.length - 1)) * clipDuration
      : 0
    if (!isFinite(offset)) return
    videoRef.current.currentTime = Math.max(0, offset)
    videoRef.current.play()
  }

  return (
    <div className="clip-viewer">
      <div className="clip-video-wrap">
        <video ref={videoRef} controls autoPlay>
          <source src={src} type="video/mp4" />
        </video>
      </div>

      <div className="clip-quotes-wrap">
        {quotes.map((quote, i) => {
          const isMatch = lowerQ && quote.text.toLowerCase().includes(lowerQ)
          return (
            <div
              key={quote.id}
              onClick={() => seekTo(i)}
              style={{
                padding: '0.4rem 0.75rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                background: isMatch ? '#FFFBCC' : i % 2 === 0 ? '#fff' : '#fafafa',
                borderTop: i > 0 ? '1px solid #e5e5e5' : undefined,
                cursor: 'pointer',
              }}
              title="Click to seek to this line"
            >
              <SpeakerLink
                id={quote.speaker?.id ?? null}
                name={quote.speaker?.name ?? null}
                imageUrl={quote.speaker?.imageUrl ?? null}
                imagePosition={quote.speaker?.imagePosition ?? null}
                isMatch={!!isMatch}
                compact
              />
              <span style={{ fontWeight: isMatch ? 500 : 400, color: isMatch ? '#1a1a1a' : '#666', lineHeight: 1.3, fontSize: '0.8rem', letterSpacing: '0.01em' }}>
                {quote.text}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
