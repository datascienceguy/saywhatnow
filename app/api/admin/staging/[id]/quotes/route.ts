import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if ((session?.user as { role?: string })?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const episodeId = parseInt(id)
  const body = await req.json()
  const { speaker, text, startTime } = body

  // Use provided sequence (for inline insertion) or default to max + 1
  let sequence = body.sequence
  if (sequence === undefined) {
    const max = await prisma.stagingQuote.aggregate({
      where: { stagingEpisodeId: episodeId },
      _max: { sequence: true },
    })
    sequence = (max._max.sequence ?? 0) + 1
  }

  const quote = await prisma.stagingQuote.create({
    data: {
      stagingEpisodeId: episodeId,
      speaker: speaker ?? '',
      text: text ?? '',
      startTime: startTime ?? null,
      sequence,
    },
  })

  return NextResponse.json(quote)
}
