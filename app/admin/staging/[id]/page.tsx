import { prisma } from '@/lib/prisma'
import { notFound } from 'next/navigation'
import StagingEditor from './StagingEditor'

export default async function StagingEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ep = await prisma.stagingEpisode.findUnique({
    where: { id: Number(id) },
    include: {
      show: true,
      clips: { orderBy: { index: 'asc' } },
      quotes: { orderBy: { sequence: 'asc' } },
    },
  })
  if (!ep) notFound()

  return <StagingEditor episode={ep} />
}
