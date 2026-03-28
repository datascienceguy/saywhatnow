import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { writeFile } from 'fs/promises'
import path from 'path'
import { uploadToR2 } from '@/lib/r2'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const speakerId = Number(id)

  const form = await req.formData()
  const file = form.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 })

  const speaker = await prisma.speaker.findUnique({ where: { id: speakerId } })
  if (!speaker) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const ext = file.name.split('.').pop()?.toLowerCase() || 'png'
  const filename = `${speaker.name.toLowerCase().replace(/[^a-z0-9]/g, '_')}.${ext}`
  const buffer = Buffer.from(await file.arrayBuffer())
  const contentType = file.type || 'image/png'

  const r2Url = await uploadToR2(`pictures/${filename}`, buffer, contentType)

  let imageUrl: string
  if (r2Url) {
    imageUrl = r2Url
  } else {
    // Local dev fallback
    const dest = path.join(process.cwd(), 'public', 'pictures', filename)
    await writeFile(dest, buffer)
    imageUrl = `/pictures/${filename}`
  }

  await prisma.speaker.update({ where: { id: speakerId }, data: { imageUrl } })
  return NextResponse.json({ imageUrl })
}
