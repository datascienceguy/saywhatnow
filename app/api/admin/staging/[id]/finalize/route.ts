import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { execFile } from 'child_process'
import { promisify } from 'util'
import path from 'path'
import fs from 'fs'
import { PutObjectCommand } from '@aws-sdk/client-s3'
import { r2 } from '@/lib/r2'

const execFileAsync = promisify(execFile)

function findFfmpeg(): string {
  const { execSync } = require('child_process')
  try {
    return execSync('where ffmpeg', { encoding: 'utf-8' }).trim().split('\n')[0].trim()
  } catch {}
  const winget = path.join(process.env.USERPROFILE ?? '', 'AppData/Local/Microsoft/WinGet/Packages')
  if (fs.existsSync(winget)) {
    for (const pkg of fs.readdirSync(winget)) {
      if (!pkg.startsWith('Gyan.FFmpeg')) continue
      const bin = path.join(winget, pkg)
      for (const sub of fs.readdirSync(bin)) {
        const ffPath = path.join(bin, sub, 'bin', 'ffmpeg.exe')
        if (fs.existsSync(ffPath)) return ffPath
      }
    }
  }
  throw new Error('ffmpeg not found')
}

type ImportPayload = {
  showName: string
  season: number
  episodeNumber: number
  title: string
  airDate: string | null
  productionCode: string | null
  clips: Array<{
    filePath: string; startTime: string; stopTime: string; duration: number
    quotes: Array<{ speaker: string; text: string; sequence: number }>
  }>
}

async function importEpisodeToDB(payload: ImportPayload) {
  const show = await prisma.show.findFirst({ where: { name: payload.showName } })
  if (!show) throw new Error(`Show not found: ${payload.showName}`)

  let episode = await prisma.episode.findFirst({
    where: { showId: show.id, season: payload.season, episodeNumber: payload.episodeNumber },
  })
  if (!episode) {
    episode = await prisma.episode.create({
      data: {
        showId: show.id,
        season: payload.season,
        episodeNumber: payload.episodeNumber,
        title: payload.title,
        airDate: payload.airDate ? new Date(payload.airDate) : null,
        productionCode: payload.productionCode ?? `S${payload.season}E${payload.episodeNumber}`,
      },
    })
  }

  const speakerCache = new Map<string, number>()

  for (const clipData of payload.clips) {
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
}

// POST /api/admin/staging/[id]/finalize — streams SSE progress events
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const epId = Number(id)

  const staging = await prisma.stagingEpisode.findUnique({
    where: { id: epId },
    include: {
      show: true,
      clips: { orderBy: { index: 'asc' } },
      quotes: { orderBy: { sequence: 'asc' } },
    },
  })

  const encoder = new TextEncoder()

  function makeStream(run: (send: (msg: string) => void) => Promise<void>) {
    return new ReadableStream({
      async start(controller) {
        const send = (msg: string) =>
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ msg })}\n\n`))
        const done = (error?: string) =>
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true, error })}\n\n`))

        try {
          await run(send)
          done()
        } catch (err) {
          done(String(err))
        } finally {
          controller.close()
        }
      },
    })
  }

  if (!staging) {
    const stream = makeStream(async (_send) => { throw new Error('Not found') })
    return new Response(stream, { headers: sseHeaders() })
  }
  if (staging.clips.length === 0) {
    const stream = makeStream(async () => { throw new Error('No clips defined — add clip boundaries before finalizing') })
    return new Response(stream, { headers: sseHeaders() })
  }
  const clipsWithoutTimes = staging.clips.filter(c => c.startTime == null || c.endTime == null)
  if (clipsWithoutTimes.length > 0) {
    const stream = makeStream(async () => { throw new Error(`${clipsWithoutTimes.length} clip(s) have no start/end times — set times in the staging editor before finalizing`) })
    return new Response(stream, { headers: sseHeaders() })
  }

  const stream = makeStream(async (send) => {
    const ffmpeg = findFfmpeg()
    send(`Found ffmpeg: ${ffmpeg}`)

    const showSlug = staging.show.name.toLowerCase().replace(/^the\s+/, '').replace(/\s+/g, '')
    const seasonSlug = `season${staging.season}`
    const episodeSlug = `episode${staging.episodeNumber}`
    const outDir = path.join(process.cwd(), 'public', 'clips', showSlug, seasonSlug, episodeSlug)
    fs.mkdirSync(outDir, { recursive: true })
    send(`Output directory: ${outDir}`)

    await prisma.stagingEpisode.update({ where: { id: epId }, data: { status: 'FINALIZING' } })

    const total = staging.clips.length
    let globalSequence = 0

    // Build import payload while cutting + uploading
    const importClips: Array<{
      filePath: string; startTime: string; stopTime: string; duration: number
      quotes: Array<{ speaker: string; text: string; sequence: number }>
    }> = []

    for (const stagingClip of staging.clips) {
      const filename = `${staging.season}-${staging.episodeNumber}_${stagingClip.index}.mp4`
      const outPath = path.join(outDir, filename)
      const duration = stagingClip.endTime! - stagingClip.startTime!
      const clipQuotes = staging.quotes.filter(q => q.stagingClipId === stagingClip.id)

      send(`[${stagingClip.index}/${total}] Cutting ${filename} (${duration.toFixed(1)}s, ${clipQuotes.length} lines)…`)

      try {
        await execFileAsync(ffmpeg, [
          '-y',
          '-ss', String(stagingClip.startTime!),
          '-i', staging.videoPath,
          '-t', String(duration),
          '-c:v', 'copy',
          '-c:a', 'copy',
          '-avoid_negative_ts', 'make_zero',
          outPath,
        ])
      } catch (err) {
        await prisma.stagingEpisode.update({ where: { id: epId }, data: { status: 'DRAFT' } })
        throw new Error(`ffmpeg failed on clip ${stagingClip.index}: ${err}`)
      }

      const r2Key = `clips/${showSlug}/${seasonSlug}/${episodeSlug}/${filename}`

      if (r2) {
        send(`[${stagingClip.index}/${total}] Uploading to R2…`)
        await r2.send(new PutObjectCommand({
          Bucket: process.env.R2_BUCKET_NAME!,
          Key: r2Key,
          Body: fs.readFileSync(outPath),
          ContentType: 'video/mp4',
        }))
        fs.unlinkSync(outPath)
        send(`[${stagingClip.index}/${total}] Uploaded ✓`)
      }

      importClips.push({
        filePath: r2Key,
        startTime: String(stagingClip.startTime),
        stopTime: String(stagingClip.endTime),
        duration: Math.round(duration),
        quotes: clipQuotes.map(sq => ({
          speaker: sq.speaker.trim().toUpperCase(),
          text: sq.text.toUpperCase(),
          sequence: globalSequence++,
        })),
      })
    }

    const importPayload = {
      showName: staging.show.name,
      season: staging.season,
      episodeNumber: staging.episodeNumber,
      title: staging.title.toUpperCase(),
      airDate: staging.airDate ? staging.airDate.toISOString() : null,
      productionCode: staging.productionCode ?? staging.basename.toUpperCase(),
      clips: importClips,
    }

    // Import to local DB
    send('Importing to local database…')
    await importEpisodeToDB(importPayload)
    send('Local database updated ✓')

    // Push to prod if configured
    const prodUrl = process.env.PROD_API_URL
    if (prodUrl) {
      send(`Pushing to production (${prodUrl})…`)
      const res = await fetch(`${prodUrl}/api/admin/import-episode`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-internal-secret': process.env.INTERNAL_API_SECRET! },
        body: JSON.stringify(importPayload),
      })
      if (!res.ok) {
        const msg = await res.text()
        throw new Error(`Prod import failed (HTTP ${res.status}): ${msg}`)
      }
      send('Production database updated ✓')
    }

    await prisma.stagingEpisode.update({ where: { id: epId }, data: { status: 'COMPLETE' } })
    send(`Finalized ${total} clips — episode imported successfully.`)
  })

  return new Response(stream, { headers: sseHeaders() })
}

function sseHeaders() {
  return {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  }
}
