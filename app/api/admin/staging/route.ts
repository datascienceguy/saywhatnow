import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import path from 'path'
import fs from 'fs'

// POST /api/admin/staging — create a new staging episode and seed quotes from JSON
export async function POST(req: NextRequest) {
  const body = await req.json()
  const { season, episodeNumber, title, airDate, productionCode, basename } = body

  if (!season || !episodeNumber || !title || !basename) {
    return NextResponse.json({ error: 'season, episodeNumber, title, basename required' }, { status: 400 })
  }

  // Resolve file paths
  const clipPrepDir = path.join(process.cwd(), 'clip_prep', basename)
  const videoPath = path.join(clipPrepDir, `${basename}.mp4`)
  const quotesPath = path.join(clipPrepDir, `${basename}-quotes.json`)

  if (!fs.existsSync(videoPath)) {
    return NextResponse.json({ error: `Video not found: clip_prep/${basename}/${basename}.mp4` }, { status: 400 })
  }
  if (!fs.existsSync(quotesPath)) {
    return NextResponse.json({ error: `Quotes not found: clip_prep/${basename}/${basename}-quotes.json` }, { status: 400 })
  }

  // The Simpsons show — hardcoded for now
  const show = await prisma.show.findFirst({ where: { name: { contains: 'Simpsons' } } })
  if (!show) {
    return NextResponse.json({ error: 'Simpsons show not found in DB' }, { status: 500 })
  }

  // Check for existing staging episode
  const existing = await prisma.stagingEpisode.findUnique({ where: { basename } })
  if (existing) {
    return NextResponse.json({ error: `Staging episode already exists for ${basename}` }, { status: 409 })
  }

  // Parse quotes JSON
  const quotesJson = JSON.parse(fs.readFileSync(quotesPath, 'utf-8'))
  const quotes: Array<{
    speaker: string
    text: string
    startTime: number | null
    endTime: number | null
    matchMethod: string | null
    sequence: number
  }> = quotesJson.quotes

  // Create staging episode + quotes in one transaction
  const stagingEpisode = await prisma.$transaction(async (tx) => {
    const ep = await tx.stagingEpisode.create({
      data: {
        showId: show.id,
        season: Number(season),
        episodeNumber: Number(episodeNumber),
        title,
        airDate: airDate ? new Date(airDate) : null,
        productionCode: productionCode || null,
        basename,
        videoPath,
        quotesPath,
        status: 'DRAFT',
      },
    })

    await tx.stagingQuote.createMany({
      data: quotes.map((q, i) => ({
        stagingEpisodeId: ep.id,
        speaker: q.speaker,
        text: q.text,
        startTime: q.startTime ?? null,
        endTime: q.endTime ?? null,
        matchMethod: q.matchMethod ?? null,
        sequence: i,
      })),
    })

    return ep
  })

  return NextResponse.json({ id: stagingEpisode.id })
}
