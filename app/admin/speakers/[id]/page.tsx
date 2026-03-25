import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import SpeakerEditForm from './SpeakerEditForm'

interface Props { params: Promise<{ id: string }> }

export default async function SpeakerEditPage({ params }: Props) {
  const { id } = await params
  const speaker = await prisma.speaker.findUnique({
    where: { id: Number(id) },
    include: { show: true },
  })
  if (!speaker) notFound()
  return (
    <div className="min-h-screen bg-gray-950 text-white p-6">
      <div className="max-w-lg mx-auto">
        <div className="mb-6">
          <a href="/admin/speakers" className="text-gray-500 hover:text-gray-300 text-sm">← Speakers</a>
        </div>
        <h1 className="text-xl font-semibold mb-1">{speaker.name}</h1>
        <p className="text-gray-500 text-sm mb-6">{speaker.show.name}</p>
        <SpeakerEditForm speaker={speaker} />
      </div>
    </div>
  )
}
