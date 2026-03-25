import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { execFile } from 'child_process'
import { promisify } from 'util'
import path from 'path'
import fs from 'fs'

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

    // Ensure Episode exists
    let episode = await prisma.episode.findFirst({
      where: { showId: staging.showId, season: staging.season, episodeNumber: staging.episodeNumber },
    })
    if (!episode) {
      episode = await prisma.episode.create({
        data: {
          showId: staging.showId,
          season: staging.season,
          episodeNumber: staging.episodeNumber,
          title: staging.title.toUpperCase(),
          airDate: staging.airDate,
          productionCode: staging.productionCode ?? staging.basename.toUpperCase(),
        },
      })
      send(`Created episode: ${episode.title}`)
    } else {
      send(`Using existing episode: ${episode.title}`)
    }

    const total = staging.clips.length
    let sequence = 0

    for (const stagingClip of staging.clips) {
      const filename = `${staging.season}-${staging.episodeNumber}_${stagingClip.index}.mp4`
      const outPath = path.join(outDir, filename)
      const duration = stagingClip.endTime - stagingClip.startTime
      const clipQuotes = staging.quotes.filter(q => q.stagingClipId === stagingClip.id)

      send(`[${stagingClip.index}/${total}] Cutting ${filename} (${duration.toFixed(1)}s, ${clipQuotes.length} lines)…`)

      try {
        await execFileAsync(ffmpeg, [
          '-y',
          '-ss', String(stagingClip.startTime),
          '-i', staging.videoPath,
          '-t', String(duration),
          '-c:v', 'libx264', '-crf', '18', '-preset', 'fast',
          '-c:a', 'aac', '-b:a', '192k', '-ac', '2',
          outPath,
        ])
      } catch (err) {
        await prisma.stagingEpisode.update({ where: { id: epId }, data: { status: 'DRAFT' } })
        throw new Error(`ffmpeg failed on clip ${stagingClip.index}: ${err}`)
      }

      send(`[${stagingClip.index}/${total}] Importing to database…`)

      const filePath = `/clips/${showSlug}/${seasonSlug}/${episodeSlug}/${filename}`
      const clip = await prisma.clip.create({
        data: {
          episodeId: episode.id,
          filePath,
          startTime: String(stagingClip.startTime),
          stopTime: String(stagingClip.endTime),
          duration: Math.round(duration),
        },
      })

      const speakerCache = new Map<string, number>()

      for (const sq of clipQuotes) {
        let speakerId: number | null = null
        const speakerName = sq.speaker.trim()
        if (speakerName) {
          if (speakerCache.has(speakerName)) {
            speakerId = speakerCache.get(speakerName)!
          } else {
            let speaker = await prisma.speaker.findFirst({
              where: { showId: staging.showId, name: speakerName },
            })
            if (!speaker) {
              speaker = await prisma.speaker.create({
                data: { showId: staging.showId, name: speakerName, type: 'ONE_TIME' },
              })
              send(`  Created new speaker: ${speakerName}`)
            }
            speakerCache.set(speakerName, speaker.id)
            speakerId = speaker.id
          }
        }

        await prisma.quote.create({
          data: { episodeId: episode.id, clipId: clip.id, speakerId, text: sq.text.toUpperCase(), sequence: sequence++ },
        })
      }

      for (const [name, sid] of speakerCache) {
        const count = clipQuotes.filter(q => q.speaker.trim() === name).length
        await prisma.clipSpeaker.upsert({
          where: { clipId_speakerId: { clipId: clip.id, speakerId: sid } },
          create: { clipId: clip.id, speakerId: sid, lineCount: count },
          update: { lineCount: count },
        })
      }

      send(`[${stagingClip.index}/${total}] Done ✓`)
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
