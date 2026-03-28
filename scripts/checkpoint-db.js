// Force SQLite WAL checkpoint so all changes are flushed into dev.db before upload
const Database = require('better-sqlite3')
const db = new Database('./prisma/dev.db')
const result = db.pragma('wal_checkpoint(TRUNCATE)')
console.log('WAL checkpoint:', JSON.stringify(result))
db.close()
