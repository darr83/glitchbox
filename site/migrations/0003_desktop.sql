-- Windows app support: build versions, patch notes, launch files, playtime, release tracking.
ALTER TABLE game_files ADD COLUMN version TEXT NOT NULL DEFAULT '';
ALTER TABLE game_files ADD COLUMN notes TEXT NOT NULL DEFAULT '';
ALTER TABLE game_files ADD COLUMN launch_path TEXT NOT NULL DEFAULT '';
ALTER TABLE games ADD COLUMN released_at INTEGER;
ALTER TABLE library ADD COLUMN playtime_minutes INTEGER NOT NULL DEFAULT 0;
ALTER TABLE library ADD COLUMN last_played INTEGER;
CREATE TABLE IF NOT EXISTS game_updates (
  id INTEGER PRIMARY KEY,
  game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  version TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS game_updates_game ON game_updates(game_id, created_at);
UPDATE games SET released_at = published_at WHERE status = 'released';
