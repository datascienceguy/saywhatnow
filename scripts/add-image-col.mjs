import Database from 'better-sqlite3'
import { fileURLToPath } from 'url'
import path from 'path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const db = new Database(path.join(__dirname, '../prisma/dev.db'))

try {
  db.exec('ALTER TABLE Speaker ADD COLUMN imageUrl TEXT')
  console.log('Column imageUrl added successfully')
} catch (e) {
  console.log('Error (may already exist):', e.message)
}

const cols = db.prepare('PRAGMA table_info(Speaker)').all()
console.log('Speaker columns:', cols.map(c => c.name).join(', '))
db.close()
