import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { name, type, imageUrl } = await req.json()
  const speaker = await prisma.speaker.update({
    where: { id: Number(id) },
    data: { name, type, imageUrl },
  })
  return NextResponse.json(speaker)
}
