const Database = require('better-sqlite3')
const fs = require('fs')
const path = require('path')

// Vercel's filesystem is read-only apart from /tmp, so on serverless the
// database lives there. It is a cache plus per-user scratch state — every
// table below is recreated on demand — so an empty /tmp db is a valid start.
// SQLITE_PATH overrides both for anyone pointing at a mounted volume.
function resolveDbPath() {
  if (process.env.SQLITE_PATH) return process.env.SQLITE_PATH
  if (process.env.VERCEL) return '/tmp/chicago.db'
  return path.join(__dirname, 'chicago.db')
}

const dbPath = resolveDbPath()
fs.mkdirSync(path.dirname(dbPath), { recursive: true })

const db = new Database(dbPath)

db.exec(`
  CREATE TABLE IF NOT EXISTS yelp_cache (
    cache_key TEXT PRIMARY KEY,
    data      TEXT NOT NULL,
    cached_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS me_favorites (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id   TEXT NOT NULL,
    place_id  TEXT NOT NULL,
    place_name TEXT NOT NULL,
    lat       REAL,
    lon       REAL,
    added_at  INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    UNIQUE(user_id, place_id)
  );
  CREATE TABLE IF NOT EXISTS me_visited (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id   TEXT NOT NULL,
    place_id  TEXT NOT NULL,
    place_name TEXT NOT NULL,
    visited_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    UNIQUE(user_id, place_id)
  );
  CREATE TABLE IF NOT EXISTS cta_routes_cache (
    id        INTEGER PRIMARY KEY,
    data      TEXT NOT NULL,
    cached_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS me_bucket (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id   TEXT NOT NULL,
    item_name TEXT NOT NULL,
    item_type TEXT NOT NULL DEFAULT 'place',
    added_at  INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )
`)

// Safe migration — add notes column if it doesn't exist yet
try { db.exec(`ALTER TABLE me_visited ADD COLUMN notes TEXT NOT NULL DEFAULT ''`) } catch {}

module.exports = db
