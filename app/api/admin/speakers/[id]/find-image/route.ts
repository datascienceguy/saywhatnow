import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { writeFile } from 'fs/promises'
import path from 'path'
import { uploadToR2 } from '@/lib/r2'

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const speakerId = Number(id)

  const speaker = await prisma.speaker.findUnique({ where: { id: speakerId } })
  if (!speaker) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const searchName = toTitleCase(speaker.name)

  // First try direct title lookup
  let wikiImageUrl = await fetchWikiImage(searchName)

  // If not found, search the wiki for the closest matching page
  if (!wikiImageUrl) {
    const searchRes = await fetch(`https://simpsons.fandom.com/api.php?action=opensearch&search=${encodeURIComponent(searchName)}&limit=1&format=json`)
    if (searchRes.ok) {
      const [, titles] = await searchRes.json()
      if (titles?.[0]) wikiImageUrl = await fetchWikiImage(titles[0])
    }
  }

  if (!wikiImageUrl) {
    return NextResponse.json({ error: `No image found for "${searchName}" on Simpsons wiki` }, { status: 404 })
  }

  const imgRes = await fetch(wikiImageUrl)
  if (!imgRes.ok) return NextResponse.json({ error: 'Failed to download image' }, { status: 502 })

  const buffer = Buffer.from(await imgRes.arrayBuffer())
  const ext = wikiImageUrl.split('.').pop()?.split('/')[0]?.toLowerCase().replace(/[^a-z]/g, '') || 'png'
  const filename = `${speaker.name.toLowerCase().replace(/[^a-z0-9]/g, '_')}.${ext}`
  const contentType = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'image/png'

  const r2Url = await uploadToR2(`pictures/${filename}`, buffer, contentType)

  let imageUrl: string
  if (r2Url) {
    imageUrl = r2Url
  } else {
    // Local dev fallback
    const dest = path.join(process.cwd(), 'public', 'pictures', filename)
    await writeFile(dest, buffer)
    imageUrl = `/pictures/${filename}`
  }

  await prisma.speaker.update({ where: { id: speakerId }, data: { imageUrl } })
  return NextResponse.json({ imageUrl, wikiTitle: searchName })
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
