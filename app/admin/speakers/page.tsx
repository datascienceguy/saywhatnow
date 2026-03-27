export const dynamic = 'force-dynamic'

import { prisma } from '@/lib/prisma'
import SpeakerList from './SpeakerList'

export default async function SpeakersPage() {
  const speakers = await prisma.speaker.findMany({
    include: { show: true },
    orderBy: { name: 'asc' },
  })
  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Speakers</h1>
      <SpeakerList speakers={speakers} />
    </div>
  )
}
