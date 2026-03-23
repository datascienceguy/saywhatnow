import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// PATCH /api/admin/staging/[id]/quotes/[qid] — update speaker or text
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; qid: string }> }
) {
  const { qid } = await params
  const body = await req.json()
  const data: { speaker?: string; text?: string; startTime?: number } = {}
  if (body.speaker !== undefined) data.speaker = body.speaker
  if (body.text !== undefined) data.text = body.text
  if (body.startTime !== undefined) data.startTime = body.startTime

  const quote = await prisma.stagingQuote.update({
    where: { id: Number(qid) },
    data,
  })
  return NextResponse.json(quote)
}

// DELETE /api/admin/staging/[id]/quotes/[qid]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; qid: string }> }
) {
  const { qid } = await params
  await prisma.stagingQuote.delete({ where: { id: Number(qid) } })
  return NextResponse.json({ ok: true })
}
