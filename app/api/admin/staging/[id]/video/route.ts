import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import fs from 'fs'

// GET /api/admin/staging/[id]/video — stream the full-episode MP4
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ep = await prisma.stagingEpisode.findUnique({
    where: { id: Number(id) },
    select: { videoPath: true },
  })
  if (!ep) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { videoPath } = ep
  if (!fs.existsSync(videoPath)) {
    return NextResponse.json({ error: 'Video file not found on disk' }, { status: 404 })
  }

  const stat = fs.statSync(videoPath)
  const fileSize = stat.size
  const range = req.headers.get('range')

  if (range) {
    const [startStr, endStr] = range.replace(/bytes=/, '').split('-')
    const start = parseInt(startStr, 10)
    const end = endStr ? parseInt(endStr, 10) : fileSize - 1
    const chunkSize = end - start + 1

    const stream = fs.createReadStream(videoPath, { start, end })
    return new NextResponse(stream as unknown as ReadableStream, {
      status: 206,
      headers: {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': String(chunkSize),
        'Content-Type': 'video/mp4',
      },
    })
  }

  const stream = fs.createReadStream(videoPath)
  return new NextResponse(stream as unknown as ReadableStream, {
    headers: {
      'Content-Length': String(fileSize),
      'Content-Type': 'video/mp4',
      'Accept-Ranges': 'bytes',
    },
  })
}
