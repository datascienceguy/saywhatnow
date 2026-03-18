'use client'

import { useEffect, useRef } from 'react'

export default function VideoPlayer({ src }: { src: string }) {
  const ref = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    return () => {
      ref.current?.pause()
    }
  }, [])

  return (
    <video ref={ref} controls autoPlay style={{ display: 'block', maxWidth: '100%' }}>
      <source src={src} type="video/mp4" />
    </video>
  )
}
