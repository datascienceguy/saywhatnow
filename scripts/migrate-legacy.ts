import Database from 'better-sqlite3'
import * as fs from 'fs'
import * as path from 'path'

const DB_PATH = path.join(__dirname, '../prisma/dev.db')
const SQL_PATH = path.join(__dirname, '../../saywhatnow/swn_videos_new.sql')

const db = new Database(DB_PATH)

const SPEAKER_TYPE_MAP: Record<number, string> = {
  1: 'MAIN',
  2: 'RECURRING',
  3: 'GUEST',
  4: 'ONE_TIME',
  5: 'OTHER',
  6: 'OTHER',
}

function parseValueTuple(valStr: string): (string | number | null)[] {
  const values: (string | number | null)[] = []
  let i = 0
  let current = ''
  let inStr = false

  while (i < valStr.length) {
    const ch = valStr[i]
    if (inStr) {
      if (ch === "'" && valStr[i + 1] === "'") { current += "'"; i += 2 }
      else if (ch === "'") { inStr = false; i++ }
      else { current += ch; i++ }
    } else if (ch === "'") {
      inStr = true; i++
    } else if (ch === ',') {
      const t = current.trim()
      if (t === 'NULL') values.push(null)
      else if (t !== '' && !isNaN(Number(t))) values.push(Number(t))
      else values.push(t)
      current = ''; i++
    } else {
      current += ch; i++
    }
  }

  const t = current.trim()
  if (t === 'NULL') values.push(null)
  else if (t !== '' && !isNaN(Number(t))) values.push(Number(t))
  else if (t !== '') values.push(t)

  return values
}

function extractInserts(sql: string, tableName: string): Record<string, any>[] {
  const results: Record<string, any>[] = []
  const re = new RegExp(
    `^INSERT INTO \`${tableName}\` \\(([^)]+)\\) VALUES \\((.+)\\);$`,
    'gm'
  )
  let match
  while ((match = re.exec(sql)) !== null) {
    const columns = match[1].split(',').map(c => c.trim().replace(/`/g, ''))
    const values = parseValueTuple(match[2])
    if (columns.length !== values.length) continue
    const row: Record<string, any> = {}
    columns.forEach((col, i) => { row[col] = values[i] })
    results.push(row)
  }
  return results
}

function main() {
  console.log(`Reading SQL file...`)
  const sql = fs.readFileSync(SQL_PATH, 'utf8')
  console.log('Done. Starting migration...\n')

  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = OFF')

  // Shows
  console.log('Migrating shows...')
  const shows = extractInserts(sql, 'shows')
  const insertShow = db.prepare('INSERT OR IGNORE INTO Show (id, name) VALUES (?, ?)')
  const insertShowBatch = db.transaction((rows: typeof shows) => {
    for (const s of rows) insertShow.run(s.show_id, s.name)
  })
  insertShowBatch(shows)
  console.log(`  ${shows.length} shows`)

  // Episodes
  console.log('Migrating episodes...')
  const episodes = extractInserts(sql, 'episodes')
  const insertEp = db.prepare(
    'INSERT OR IGNORE INTO Episode (id, showId, season, episodeNumber, airDate, productionCode, title) VALUES (?, ?, ?, ?, ?, ?, ?)'
  )
  const insertEpBatch = db.transaction((rows: typeof episodes) => {
    for (const e of rows) {
      insertEp.run(e.episode_id, e.show_id, e.season, e.episode_number,
        e.air_date ?? null, e.production_code, e.name)
    }
  })
  insertEpBatch(episodes)
  console.log(`  ${episodes.length} episodes`)

  // Speakers
  console.log('Migrating speakers...')
  const speakers = extractInserts(sql, 'speakers')
  const speakerPictures = extractInserts(sql, 'speaker_pictures')
  const speakerImageMap: Record<number, string> = {}
  for (const p of speakerPictures) {
    speakerImageMap[p.speaker_id as number] = p.image_url as string
  }
  const insertSp = db.prepare(
    'INSERT OR IGNORE INTO Speaker (id, showId, name, type, imageUrl) VALUES (?, ?, ?, ?, ?)'
  )
  const insertSpBatch = db.transaction((rows: typeof speakers) => {
    for (const s of rows) {
      insertSp.run(s.speaker_id, s.show_id, s.name,
        SPEAKER_TYPE_MAP[s.speaker_type_id as number] ?? 'OTHER',
        speakerImageMap[s.speaker_id as number] ?? null)
    }
  })
  insertSpBatch(speakers)
  console.log(`  ${speakers.length} speakers (${Object.keys(speakerImageMap).length} with images)`)

  // Clips
  console.log('Migrating clips...')
  const clips = extractInserts(sql, 'clips')
  const insertClip = db.prepare(
    'INSERT OR IGNORE INTO Clip (id, episodeId, filePath, duration, startTime, stopTime) VALUES (?, ?, ?, ?, ?, ?)'
  )
  const insertClipBatch = db.transaction((rows: typeof clips) => {
    for (const c of rows) {
      insertClip.run(c.clip_id, c.episode_id, `${c.path}${c.file}`,
        c.seconds ?? null, c.start_time, c.stop_time)
    }
  })
  insertClipBatch(clips)
  console.log(`  ${clips.length} clips`)

  // Quotes (large — batch in transactions of 1000)
  console.log('Migrating quotes...')
  const quotes = extractInserts(sql, 'quotes')
  const insertQuote = db.prepare(
    'INSERT OR IGNORE INTO Quote (id, episodeId, clipId, speakerId, text, sequence) VALUES (?, ?, ?, ?, ?, ?)'
  )
  const insertQuoteBatch = db.transaction((rows: typeof quotes) => {
    for (const q of rows) {
      insertQuote.run(q.quote_id, q.episode_id, q.clip_id,
        q.speaker_id ?? null, q.quote, q.sequence_num)
    }
  })
  const BATCH = 2000
  for (let i = 0; i < quotes.length; i += BATCH) {
    insertQuoteBatch(quotes.slice(i, i + BATCH))
    process.stdout.write(`\r  quotes: ${Math.min(i + BATCH, quotes.length)} / ${quotes.length}`)
  }
  console.log()

  // ClipSpeakers
  console.log('Migrating clip speakers...')
  const clipSpeakers = extractInserts(sql, 'clips_speakers')
  const insertCs = db.prepare(
    'INSERT OR IGNORE INTO ClipSpeaker (clipId, speakerId, lineCount) VALUES (?, ?, ?)'
  )
  const insertCsBatch = db.transaction((rows: typeof clipSpeakers) => {
    for (const cs of rows) insertCs.run(cs.clip_id, cs.speaker_id, cs.times)
  })
  insertCsBatch(clipSpeakers)
  console.log(`  ${clipSpeakers.length} clip speakers`)

  // Summary
  console.log('\nMigration complete!')
  const tables = ['Show', 'Episode', 'Speaker', 'Clip', 'Quote', 'ClipSpeaker']
  for (const t of tables) {
    const row = db.prepare(`SELECT COUNT(*) as n FROM "${t}"`).get() as { n: number }
    console.log(`  ${t.padEnd(14)}: ${row.n}`)
  }

  db.close()
}

main()
