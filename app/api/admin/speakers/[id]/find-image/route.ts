import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { writeFile } from 'fs/promises'
import path from 'path'

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const speakerId = Number(id)

  const speaker = await prisma.speaker.findUnique({ where: { id: speakerId } })
  if (!speaker) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const searchName = toTitleCase(speaker.name)

  // First try direct title lookup
  let imageUrl = await fetchWikiImage(searchName)

  // If not found, search the wiki for the closest matching page
  if (!imageUrl) {
    const searchRes = await fetch(`https://simpsons.fandom.com/api.php?action=opensearch&search=${encodeURIComponent(searchName)}&limit=1&format=json`)
    if (searchRes.ok) {
      const [, titles] = await searchRes.json()
      if (titles?.[0]) imageUrl = await fetchWikiImage(titles[0])
    }
  }

  if (!imageUrl) {
    return NextResponse.json({ error: `No image found for "${searchName}" on Simpsons wiki` }, { status: 404 })
  }

  // reuse imageUrl as the wikiImageUrl below
  const wikiImageUrl = imageUrl

  // Download and save the image
  const imgRes = await fetch(wikiImageUrl)
  if (!imgRes.ok) return NextResponse.json({ error: 'Failed to download image' }, { status: 502 })

  const buffer = Buffer.from(await imgRes.arrayBuffer())
  const ext = wikiImageUrl.split('.').pop()?.split('/')[0]?.toLowerCase().replace(/[^a-z]/g, '') || 'png'
  const filename = `${speaker.name.toLowerCase().replace(/[^a-z0-9]/g, '_')}.${ext}`
  const dest = path.join(process.cwd(), 'public', 'pictures', filename)

  await writeFile(dest, buffer)
  const localUrl = `/pictures/${filename}`
  await prisma.speaker.update({ where: { id: speakerId }, data: { imageUrl: localUrl } })

  return NextResponse.json({ imageUrl: localUrl, wikiTitle: searchName })
}

async function fetchWikiImage(title: string): Promise<string | null> {
  const url = `https://simpsons.fandom.com/api.php?action=query&titles=${encodeURIComponent(title)}&prop=pageimages&format=json&pithumbsize=400&redirects=1`
  const res = await fetch(url)
  if (!res.ok) return null
  const data = await res.json()
  const pages = data?.query?.pages ?? {}
  const page = Object.values(pages)[0] as any
  if (!page || page.missing !== undefined || !page.thumbnail?.source) return null
  return page.thumbnail.source
}

function toTitleCase(name: string): string {
  return name.toLowerCase().replace(/\b\w/g, c => c.toUpperCase())
}
