import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import fs from 'fs'

// PUT /api/admin/staging/[id]/quotes — replace all quotes from quotes JSON on disk
export async function PUT(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const episodeId = parseInt(id)

  const ep = await prisma.stagingEpisode.findUnique({ where: { id: episodeId } })
  if (!ep) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!ep.quotesPath || !fs.existsSync(ep.quotesPath)) {
    return NextResponse.json({ error: `Quotes JSON not found at ${ep.quotesPath}` }, { status: 400 })
  }

  const quotesJson = JSON.parse(fs.readFileSync(ep.quotesPath, 'utf-8'))
  const quotes: Array<{ speaker: string; text: string; startTime: number | null; endTime: number | null; matchMethod: string | null }> = quotesJson.quotes

  const prefixQuotes = [
    { speaker: 'CHORUS', text: 'THE SIMPSONS', sequence: 0 },
    { speaker: 'CHALKBOARD', text: '', sequence: 1 },
    { speaker: 'HOMER SIMPSON', text: 'AHH!', sequence: 2 },
  ]

  await prisma.$transaction(async (tx) => {
    await tx.stagingQuote.deleteMany({ where: { stagingEpisodeId: episodeId } })
    await tx.stagingQuote.createMany({
      data: [
        ...prefixQuotes.map(q => ({
          stagingEpisodeId: episodeId,
          speaker: q.speaker,
          text: q.text,
          startTime: null,
          endTime: null,
          matchMethod: null,
          sequence: q.sequence,
        })),
        ...quotes.map((q, i) => ({
          stagingEpisodeId: episodeId,
          speaker: q.speaker,
          text: q.text,
          startTime: q.startTime ?? null,
          endTime: q.endTime ?? null,
          matchMethod: q.matchMethod ?? null,
          sequence: i + 3,
        })),
      ],
    })
  })

  return NextResponse.json({ ok: true, total: quotes.length + 3 })
}

// PATCH /api/admin/staging/[id]/quotes — bulk update sequences for reordering
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if ((session?.user as { role?: string })?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const episodeId = parseInt(id)
  const body = await req.json()
  const { order }: { order: { id: number; sequence: number }[] } = body

  await prisma.$transaction(
    order.map(({ id: qid, sequence }) =>
      prisma.stagingQuote.update({ where: { id: qid, stagingEpisodeId: episodeId }, data: { sequence } })
    )
  )

  return NextResponse.json({ ok: true })
}

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
