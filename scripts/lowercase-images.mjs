import Database from 'better-sqlite3'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DB_PATH = path.join(__dirname, '../prisma/dev.db')
const PICS_DIR = path.join(__dirname, '../public/pictures')

// Rename all files to lowercase
const files = fs.readdirSync(PICS_DIR)
let renamed = 0
for (const file of files) {
  const lower = file.toLowerCase()
  if (file !== lower) {
    fs.renameSync(path.join(PICS_DIR, file), path.join(PICS_DIR, lower))
    renamed++
  }
}
console.log(`Renamed ${renamed} files to lowercase`)

// Update DB imageUrl values to lowercase
const db = new Database(DB_PATH)
const speakers = db.prepare('SELECT id, imageUrl FROM Speaker WHERE imageUrl IS NOT NULL').all()
const update = db.prepare('UPDATE Speaker SET imageUrl = ? WHERE id = ?')
const batch = db.transaction((rows) => {
  let count = 0
  for (const s of rows) {
    const lower = s.imageUrl.toLowerCase()
    if (lower !== s.imageUrl) {
      update.run(lower, s.id)
      count++
    }
  }
  return count
})
const updated = batch(speakers)
console.log(`Updated ${updated} imageUrl values in DB to lowercase`)

// Sample check
const sample = db.prepare('SELECT name, imageUrl FROM Speaker WHERE imageUrl IS NOT NULL LIMIT 3').all()
console.log('Sample:', JSON.stringify(sample, null, 2))
db.close()
