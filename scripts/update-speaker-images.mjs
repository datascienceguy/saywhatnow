import Database from 'better-sqlite3'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DB_PATH = path.join(__dirname, '../prisma/dev.db')
const SQL_PATH = path.join(__dirname, '../../saywhatnow/swn_videos_new.sql')

const sql = fs.readFileSync(SQL_PATH, 'utf8')
const db = new Database(DB_PATH)

// Extract speaker_pictures rows
const re = /^INSERT INTO `speaker_pictures` \(([^)]+)\) VALUES \((.+)\);$/gm
const pictures = []
let match
while ((match = re.exec(sql)) !== null) {
  const cols = match[1].split(',').map(c => c.trim().replace(/`/g, ''))
  const vals = match[2].split(',').map(v => v.trim().replace(/^'|'$/g, ''))
  const row = {}
  cols.forEach((c, i) => row[c] = vals[i])
  pictures.push(row)
}

console.log(`Found ${pictures.length} speaker pictures`)

const update = db.prepare('UPDATE Speaker SET imageUrl = ? WHERE id = ?')
const batch = db.transaction((rows) => {
  let count = 0
  for (const p of rows) {
    const result = update.run(p.image_url, Number(p.speaker_id))
    if (result.changes > 0) count++
  }
  return count
})

const updated = batch(pictures)
console.log(`Updated ${updated} speakers with images`)

// Verify
const sample = db.prepare('SELECT id, name, imageUrl FROM Speaker WHERE imageUrl IS NOT NULL LIMIT 5').all()
console.log('Sample:', JSON.stringify(sample, null, 2))

db.close()
