#!/usr/bin/env node
/**
 * Push a finalized episode from local DB to prod.
 * Use this when finalize succeeded locally but the prod DB push failed.
 *
 * Usage:
 *   node scripts/push-episode-to-prod.js --season 1 --episode 7
 */

const Database = require('better-sqlite3')
const path = require('path')
const fs = require('fs')

const args = process.argv.slice(2)
const getArg = (flag) => { const i = args.indexOf(flag); return i !== -1 ? args[i + 1] : null }
const season = parseInt(getArg('--season') ?? getArg('-s'))
const episode = parseInt(getArg('--episode') ?? getArg('-e'))
const force = args.includes('--force')

if (!season || !episode) {
  console.error('Usage: node scripts/push-episode-to-prod.js --season <n> --episode <n> [--force]')
  process.exit(1)
}

// Load env
const envFile = path.join(__dirname, '..', '.env.local')
const env = {}
for (const line of fs.readFileSync(envFile, 'utf-8').split('\n')) {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue
  const [k, ...rest] = trimmed.split('=')
  env[k.trim()] = rest.join('=').trim().replace(/^["']|["']$/g, '')
}

const prodUrl = env.PROD_API_URL
const secret = env.INTERNAL_API_SECRET
if (!prodUrl) { console.error('PROD_API_URL not set in .env.local'); process.exit(1) }
if (!secret) { console.error('INTERNAL_API_SECRET not set in .env.local'); process.exit(1) }

const db = new Database(path.join(__dirname, '..', 'prisma', 'dev.db'), { readonly: true })

const ep = db.prepare(`
  SELECT e.*, s.name as showName
  FROM Episode e
  JOIN Show s ON s.id = e.showId
  WHERE e.season = ? AND e.episodeNumber = ?
`).get(season, episode)

if (!ep) {
  console.error(`Episode S${String(season).padStart(2,'0')}E${String(episode).padStart(2,'0')} not found in local DB`)
  process.exit(1)
}

const clips = db.prepare(`SELECT * FROM Clip WHERE episodeId = ? ORDER BY id`).all(ep.id)
if (!clips.length) {
  console.error('No clips found for this episode in local DB')
  process.exit(1)
}

const importClips = clips.map(clip => {
  const quotes = db.prepare(`
    SELECT q.text, q.sequence, sp.name as speaker
    FROM Quote q
    LEFT JOIN Speaker sp ON sp.id = q.speakerId
    WHERE q.clipId = ?
    ORDER BY q.sequence
  `).all(clip.id)

  return {
    filePath: clip.filePath,
    startTime: clip.startTime,
    stopTime: clip.stopTime,
    duration: clip.duration,
    quotes: quotes.map(q => ({ speaker: q.speaker ?? '', text: q.text, sequence: q.sequence })),
  }
})

db.close()

const payload = {
  showName: ep.showName,
  season: ep.season,
  episodeNumber: ep.episodeNumber,
  title: ep.title,
  airDate: ep.airDate,
  productionCode: ep.productionCode,
  clips: importClips,
}

console.log(`Pushing S${String(season).padStart(2,'0')}E${String(episode).padStart(2,'0')} "${ep.title}" to ${prodUrl}`)
console.log(`  ${clips.length} clips, ${importClips.reduce((n, c) => n + c.quotes.length, 0)} quotes`)

async function run() {
  if (force) {
    console.log('--force: deleting existing episode from prod...')
    const res = await fetch(`${prodUrl}/api/admin/import-episode`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', 'x-internal-secret': secret },
      body: JSON.stringify({ showName: payload.showName, season: payload.season, episodeNumber: payload.episodeNumber }),
    })
    const body = await res.text()
    if (res.ok) {
      console.log(`  Deleted: ${body}`)
    } else if (res.status === 404) {
      console.log('  Not found in prod, continuing with import...')
    } else {
      console.error(`  Delete failed (HTTP ${res.status}): ${body}`)
      process.exitCode = 1
      return
    }
  }

  const res = await fetch(`${prodUrl}/api/admin/import-episode`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-internal-secret': secret },
    body: JSON.stringify(payload),
  })
  const body = await res.text()
  if (res.ok) {
    console.log(`✓ Done: ${body}`)
  } else {
    console.error(`✗ Failed (HTTP ${res.status}): ${body}`)
    process.exitCode = 1
  }
}

run().catch(err => {
  console.error(`✗ Request failed: ${err.message}`)
  process.exitCode = 1
})
