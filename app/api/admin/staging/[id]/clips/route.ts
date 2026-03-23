import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// PUT /api/admin/staging/[id]/clips — replace all clip boundaries, auto-assign quotes
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const epId = Number(id)
  const { clips } = await req.json() as {
    clips: Array<{ index: number; startTime: number; endTime: number }>
  }

  await prisma.$transaction(async (tx) => {
    // Delete existing clips (quotes FK will be nulled via relation)
    await tx.stagingQuote.updateMany({
      where: { stagingEpisodeId: epId },
      data: { stagingClipId: null },
    })
    await tx.stagingClip.deleteMany({ where: { stagingEpisodeId: epId } })

    // Create new clips
    for (const c of clips) {
      const clip = await tx.stagingClip.create({
        data: { stagingEpisodeId: epId, index: c.index, startTime: c.startTime, endTime: c.endTime },
      })

      // Assign quotes whose startTime falls within this clip
      await tx.stagingQuote.updateMany({
        where: {
          stagingEpisodeId: epId,
          startTime: { gte: c.startTime, lte: c.endTime },
        },
        data: { stagingClipId: clip.id },
      })
    }

    await tx.stagingEpisode.update({
      where: { id: epId },
      data: { updatedAt: new Date() },
    })
  })

  return NextResponse.json({ ok: true })
}
