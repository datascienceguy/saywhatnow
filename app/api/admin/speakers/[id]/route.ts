import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { name, type, imageUrl, imagePosition } = await req.json()
  const speaker = await prisma.speaker.update({
    where: { id: Number(id) },
    data: { name, type, imageUrl, imagePosition },
  })
  return NextResponse.json(speaker)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const speakerId = Number(id)

  const speaker = await prisma.speaker.findUnique({
    where: { id: speakerId },
    include: { show: true },
  })
  if (!speaker) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await prisma.quote.updateMany({ where: { speakerId }, data: { speakerId: null } })
  await prisma.clipSpeaker.deleteMany({ where: { speakerId } })
  await prisma.speaker.delete({ where: { id: speakerId } })

  // Push deletion to prod
  const prodUrl = process.env.PROD_API_URL
  if (prodUrl) {
    try {
      await fetch(`${prodUrl}/api/admin/delete-speaker`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-internal-secret': process.env.INTERNAL_API_SECRET! },
        body: JSON.stringify({ showName: speaker.show.name, speakerName: speaker.name }),
      })
    } catch {
      // non-fatal — local deletion succeeded
    }
  }

  return NextResponse.json({ ok: true })
}
