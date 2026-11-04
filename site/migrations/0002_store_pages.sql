-- Store page setup: drafts, media, system requirements and extra details.
ALTER TABLE games ADD COLUMN published INTEGER NOT NULL DEFAULT 0;
ALTER TABLE games ADD COLUMN published_at INTEGER;
ALTER TABLE games ADD COLUMN banner TEXT;
ALTER TABLE games ADD COLUMN screenshots TEXT NOT NULL DEFAULT '[]';
ALTER TABLE games ADD COLUMN trailer_url TEXT NOT NULL DEFAULT '';
ALTER TABLE games ADD COLUMN sysreq TEXT NOT NULL DEFAULT '{}';
ALTER TABLE games ADD COLUMN controls TEXT NOT NULL DEFAULT '';
ALTER TABLE games ADD COLUMN languages TEXT NOT NULL DEFAULT '';
ALTER TABLE games ADD COLUMN content_rating TEXT NOT NULL DEFAULT '';
ALTER TABLE games ADD COLUMN content_warnings TEXT NOT NULL DEFAULT '';
ALTER TABLE games ADD COLUMN release_date TEXT NOT NULL DEFAULT '';
ALTER TABLE games ADD COLUMN website TEXT NOT NULL DEFAULT '';
ALTER TABLE games ADD COLUMN discord TEXT NOT NULL DEFAULT '';
-- Games that existed before this change stay visible.
UPDATE games SET published = 1, published_at = created_at;
CREATE INDEX IF NOT EXISTS games_published ON games(published, created_at);
