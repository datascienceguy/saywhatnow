import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// GET /api/admin/staging/[id] — full episode with clips and quotes
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ep = await prisma.stagingEpisode.findUnique({
    where: { id: Number(id) },
    include: {
      show: true,
      clips: { orderBy: { index: 'asc' } },
      quotes: { orderBy: { sequence: 'asc' } },
    },
  })
  if (!ep) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(ep)
}
