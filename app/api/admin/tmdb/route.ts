import { NextRequest, NextResponse } from 'next/server'

const SIMPSONS_TMDB_ID = 456

export async function GET(req: NextRequest) {
  const season = req.nextUrl.searchParams.get('season')
  const episode = req.nextUrl.searchParams.get('episode')

  if (!season || !episode) {
    return NextResponse.json({ error: 'season and episode required' }, { status: 400 })
  }

  const apiKey = process.env.TMDB_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'TMDB_API_KEY not configured' }, { status: 500 })
  }

  const url = `https://api.themoviedb.org/3/tv/${SIMPSONS_TMDB_ID}/season/${season}/episode/${episode}?api_key=${apiKey}`
  const res = await fetch(url)

  if (!res.ok) {
    return NextResponse.json({ error: `TMDB returned ${res.status}` }, { status: res.status })
  }

  const data = await res.json()
  return NextResponse.json({
    title: data.name ?? '',
    airDate: data.air_date ?? '',
    productionCode: data.production_code ?? '',
    overview: data.overview ?? '',
  })
}
