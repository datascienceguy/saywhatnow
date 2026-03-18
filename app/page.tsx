import { Suspense } from 'react'
import prisma from '@/lib/prisma'
import SearchForm from './components/SearchForm'
import SearchResults from './components/SearchResults'

interface PageProps {
  searchParams: Promise<{ q?: string; showId?: string; season?: string }>
}

export default async function HomePage({ searchParams }: PageProps) {
  const params = await searchParams
  const shows = await prisma.show.findMany({ orderBy: { name: 'asc' } })

  return (
    <main className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-2">SayWhatNow</h1>
      <p className="text-gray-500 dark:text-gray-400 mb-6 text-sm">
        Search quotes from The Simpsons, Futurama, and Scrubs
      </p>

      <Suspense>
        <SearchForm shows={shows} />
      </Suspense>

      {params.q && (
        <Suspense fallback={<p className="mt-8 text-gray-500">Searching...</p>}>
          <SearchResults q={params.q} showId={params.showId} season={params.season} />
        </Suspense>
      )}

      {!params.q && (
        <p className="mt-12 text-center text-gray-400 text-sm">Enter a quote to search</p>
      )}
    </main>
  )
}
