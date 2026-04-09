import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// PUT /api/admin/staging/[id]/clips — replace all clip boundaries, auto-assign quotes
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const epId = Number(id)
  const { clips } = await req.json() as {
    clips: Array<{
      index: number
      startTime?: number | null
      endTime?: number | null
      // sequence-based assignment (for episodes without timestamps)
      sequenceStart?: number
      sequenceEnd?: number
    }>
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
      const startTime = c.startTime ?? null
      const endTime = c.endTime ?? null

      // Use raw SQL to support nullable startTime/endTime
      const [clip] = await tx.$queryRaw<{ id: number }[]>`
        INSERT INTO "StagingClip" ("stagingEpisodeId", "index", "startTime", "endTime")
        VALUES (${epId}, ${c.index}, ${startTime}, ${endTime})
        RETURNING id
      `

      if (c.sequenceStart != null && c.sequenceEnd != null) {
        // Sequence-based assignment: assign quotes by sequence range
        await tx.stagingQuote.updateMany({
          where: {
            stagingEpisodeId: epId,
            sequence: { gte: c.sequenceStart, lte: c.sequenceEnd },
          },
          data: { stagingClipId: clip.id },
        })
      } else if (startTime != null && endTime != null) {
        // Timestamp-based assignment (original behavior)
        await tx.stagingQuote.updateMany({
          where: {
            stagingEpisodeId: epId,
            startTime: { gte: startTime, lte: endTime },
          },
          data: { stagingClipId: clip.id },
        })
      }
    }

    await tx.stagingEpisode.update({
      where: { id: epId },
      data: { updatedAt: new Date() },
    })
  })

  return NextResponse.json({ ok: true })
}
