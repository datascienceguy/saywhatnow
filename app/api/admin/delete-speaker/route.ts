import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// POST /api/admin/delete-speaker — remove a speaker by show+name (called from local on finalize/delete)
export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-internal-secret')
  if (!secret || secret !== process.env.INTERNAL_API_SECRET) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { showName, speakerName } = await req.json()

  const speaker = await prisma.speaker.findFirst({
    where: { name: speakerName, show: { name: showName } },
  })
  if (!speaker) return NextResponse.json({ error: 'Speaker not found' }, { status: 404 })

  await prisma.quote.updateMany({ where: { speakerId: speaker.id }, data: { speakerId: null } })
  await prisma.clipSpeaker.deleteMany({ where: { speakerId: speaker.id } })
  await prisma.speaker.delete({ where: { id: speaker.id } })

  return NextResponse.json({ ok: true })
}
