import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// POST /api/admin/import-episode — insert a finalized episode into the DB
// Auth: X-Internal-Secret header (used by local finalize to push to prod)
export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-internal-secret')
  if (!secret || secret !== process.env.INTERNAL_API_SECRET) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const {
    showName,
    season,
    episodeNumber,
    title,
    airDate,
    productionCode,
    clips,
  }: {
    showName: string
    season: number
    episodeNumber: number
    title: string
    airDate: string | null
    productionCode: string | null
    clips: Array<{
      filePath: string
      startTime: string
      stopTime: string
      duration: number
      quotes: Array<{ speaker: string; text: string; sequence: number }>
    }>
  } = body

  const show = await prisma.show.findFirst({ where: { name: showName } })
  if (!show) return NextResponse.json({ error: `Show not found: ${showName}` }, { status: 400 })

  // Upsert episode
  let episode = await prisma.episode.findFirst({
    where: { showId: show.id, season, episodeNumber },
  })
  if (!episode) {
    episode = await prisma.episode.create({
      data: { showId: show.id, season, episodeNumber, title, airDate: airDate ? new Date(airDate) : null, productionCode: productionCode ?? `S${season}E${episodeNumber}` },
    })
  }

  // Guard against double import
  const existing = await prisma.clip.findFirst({ where: { episodeId: episode.id } })
  if (existing) {
    return NextResponse.json({ error: `Episode S${season}E${episodeNumber} already has clips in this database` }, { status: 409 })
  }

  const speakerCache = new Map<string, number>()

  for (const clipData of clips) {
    const clip = await prisma.clip.create({
      data: {
        episodeId: episode.id,
        filePath: clipData.filePath,
        startTime: clipData.startTime,
        stopTime: clipData.stopTime,
        duration: clipData.duration,
      },
    })

    const clipSpeakerCounts = new Map<number, number>()

    for (const q of clipData.quotes) {
      let speakerId: number | null = null
      if (q.speaker) {
        if (speakerCache.has(q.speaker)) {
          speakerId = speakerCache.get(q.speaker)!
        } else {
          let speaker = await prisma.speaker.findFirst({ where: { showId: show.id, name: q.speaker } })
          if (!speaker) {
            speaker = await prisma.speaker.create({ data: { showId: show.id, name: q.speaker, type: 'ONE_TIME' } })
          }
          speakerCache.set(q.speaker, speaker.id)
          speakerId = speaker.id
        }
        clipSpeakerCounts.set(speakerId, (clipSpeakerCounts.get(speakerId) ?? 0) + 1)
      }

      await prisma.quote.create({
        data: { episodeId: episode.id, clipId: clip.id, speakerId, text: q.text, sequence: q.sequence },
      })
    }

    for (const [sid, count] of clipSpeakerCounts) {
      await prisma.clipSpeaker.upsert({
        where: { clipId_speakerId: { clipId: clip.id, speakerId: sid } },
        create: { clipId: clip.id, speakerId: sid, lineCount: count },
        update: { lineCount: count },
      })
    }
  }

  return NextResponse.json({ ok: true, episodeId: episode.id, clips: clips.length })
}

// DELETE /api/admin/import-episode — remove an episode and all its clips/quotes from the DB
export async function DELETE(req: NextRequest) {
  const secret = req.headers.get('x-internal-secret')
  if (!secret || secret !== process.env.INTERNAL_API_SECRET) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { showName, season, episodeNumber } = await req.json()

  const show = await prisma.show.findFirst({ where: { name: showName } })
  if (!show) return NextResponse.json({ error: `Show not found: ${showName}` }, { status: 404 })

  const episode = await prisma.episode.findFirst({
    where: { showId: show.id, season, episodeNumber },
    include: { clips: { select: { id: true } } },
  })
  if (!episode) return NextResponse.json({ error: 'Episode not found' }, { status: 404 })

  const clipIds = episode.clips.map(c => c.id)

  try {
    await prisma.clipSpeaker.deleteMany({ where: { clipId: { in: clipIds } } })
    await prisma.quote.deleteMany({ where: { episodeId: episode.id } })
    await prisma.clip.deleteMany({ where: { episodeId: episode.id } })
    await prisma.episode.delete({ where: { id: episode.id } })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }

  return NextResponse.json({ ok: true, deleted: { episodeId: episode.id, clips: clipIds.length } })
}
