CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  username TEXT UNIQUE COLLATE NOCASE,
  bio TEXT DEFAULT '',
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS login_codes (
  email TEXT PRIMARY KEY,
  code_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS code_requests (email TEXT NOT NULL, ip TEXT, at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS code_requests_at ON code_requests(at);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  last_seen INTEGER NOT NULL,
  user_agent TEXT
);
CREATE TABLE IF NOT EXISTS games (
  id INTEGER PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  developer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  tagline TEXT DEFAULT '',
  description TEXT DEFAULT '',
  genre TEXT DEFAULT 'Other',
  tags TEXT DEFAULT '',
  is_ai INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'released',
  cover TEXT,            -- R2 key
  web_prefix TEXT,       -- R2 key prefix of the live browser build
  web_entry TEXT,        -- path of index.html inside the build
  web_width INTEGER DEFAULT 960,
  web_height INTEGER DEFAULT 600,
  downloads INTEGER NOT NULL DEFAULT 0,
  plays INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS games_dev ON games(developer_id);
CREATE TABLE IF NOT EXISTS game_files (
  id INTEGER PRIMARY KEY,
  game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  filename TEXT NOT NULL,
  r2_key TEXT NOT NULL,
  size INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS game_files_game ON game_files(game_id);
CREATE TABLE IF NOT EXISTS library (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  added_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, game_id)
);
CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY,
  channel TEXT NOT NULL,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  game_id INTEGER REFERENCES games(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS posts_channel ON posts(channel, id);
