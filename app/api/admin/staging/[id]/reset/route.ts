import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if ((session?.user as { role?: string })?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const episodeId = parseInt(id)

  await prisma.stagingClip.deleteMany({ where: { stagingEpisodeId: episodeId } })

  const quotes = await prisma.stagingQuote.findMany({
    where: { stagingEpisodeId: episodeId },
    orderBy: { sequence: 'asc' },
  })

  return NextResponse.json({ quotes })
}
