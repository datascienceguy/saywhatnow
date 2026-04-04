export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import prisma from '@/lib/prisma'

export default async function RandomClipPage() {
  const count = await prisma.clip.count()
  if (!count) redirect('/')

  // Pick a random offset and fetch that clip
  const skip = Math.floor(Math.random() * count)
  const clip = await prisma.clip.findFirst({ skip, select: { id: true } })
  if (!clip) redirect('/')

  redirect(`/clip/${clip.id}`)
}
