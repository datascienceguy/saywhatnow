import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if ((session?.user as { role?: string })?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const episode = await prisma.stagingEpisode.findUnique({
    where: { id: parseInt(id) },
    select: { showId: true },
  })
  if (!episode) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const speakers = await prisma.speaker.findMany({
    where: { showId: episode.showId },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  })

  return NextResponse.json(speakers)
}
